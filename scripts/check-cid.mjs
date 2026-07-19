#!/usr/bin/env node
/**
 * Le dernier maillon : du dist/ testé jusqu'au nom public.
 *
 * La chaîne de garanties s'arrêtait au build. `npm run test:dist` valide les
 * octets, `npm run check:reproducible` valide qu'ils sont les seuls possibles —
 * puis le job ipfs télécharge un artifact, le paquette en CAR et l'épingle sans
 * que rien ne rapproche ce CID des octets validés. Ce script ferme l'écart.
 *
 * Il fait deux choses, et la seconde n'est pas facultative.
 *
 *   1. CALCUL DU CID. Appelé dans build-and-test sur le dist/ tout juste validé,
 *      il exporte le CID en sortie de job ; appelé dans le job ipfs avec
 *      --expect, il refuse de continuer si le CID a bougé pendant le transit par
 *      l'artifact. Deux calculs, deux machines, deux npm ci : leur accord est une
 *      mesure, pas une hypothèse.
 *
 *   2. COMPLÉTUDE DU CAR. Comparer deux CID produits par le même outil sur le
 *      même contenu ne peut pas révéler ce que cet outil écarte systématiquement.
 *      `ipfs-car pack` ignore par défaut tout chemin commençant par « . » : un
 *      dist/.well-known/nostr.json serait absent du miroir dans les DEUX jobs, et
 *      les CID concorderaient sans broncher. La comparaison de l'arbre réel du
 *      CAR avec celui de dist/ est le seul contrôle qui puisse voir ce trou.
 *
 * Note sur la version : package-lock.json épingle ipfs-car (3.1.0 aujourd'hui),
 * donc les deux jobs paquettent avec le même code. Une montée de version peut
 * légitimement changer le CID à contenu identique — ce n'est pas un défaut, mais
 * le nom IPNS repointera, et cela se voit dans ipfs-history.
 */
import { readdirSync, existsSync, rmSync, mkdtempSync, appendFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verdictSurLesEcarts } from './lib/car-verdict.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

/**
 * Lit la valeur d'un drapeau `--nom valeur`.
 *
 * Renvoie `undefined` si le drapeau est absent, et lève si le drapeau est
 * présent sans valeur exploitable. Cette distinction porte tout le poids du
 * contrôle : en CI, `--expect "$CID_ATTENDU"` se réduit à `--expect ""` le jour
 * où la sortie de job n'est pas câblée. Traiter cette chaîne vide comme « pas
 * d'attente » rendrait l'étape verte en permanence — un contrôle qui ne
 * contrôle plus rien, et personne pour le voir.
 *
 * (`CID_ATTENDU` vient du bloc `env:` de l'étape, pas d'une interpolation dans
 * le corps du `run:` — voir src/tests/workflowInjection.test.ts.)
 */
function argument(nom) {
  const i = process.argv.indexOf(nom);
  if (i === -1) return undefined;
  const valeur = process.argv[i + 1];
  if (!valeur || valeur.startsWith('--')) {
    throw new Error(`${nom} attend une valeur non vide (reçu : ${JSON.stringify(valeur ?? null)}).`);
  }
  return valeur;
}

/** Chemins relatifs de tout ce que contient `racine`, fichiers ET répertoires, séparateurs unifiés. */
function arbre(racine, base = racine, trouves = new Set()) {
  for (const entree of readdirSync(racine, { withFileTypes: true })) {
    const complet = join(racine, entree.name);
    trouves.add(relative(base, complet).replace(/\\/g, '/'));
    if (entree.isDirectory()) arbre(complet, base, trouves);
  }
  return trouves;
}

/** Contenu réel du CAR, dans le même vocabulaire que `arbre()`. La racine « . » est écartée. */
function contenuDuCar(car) {
  const sortie = String(execFileSync('npx', ['ipfs-car', 'ls', car], { cwd: ROOT, shell: true }));
  return new Set(
    sortie
      .split('\n')
      .map((l) => l.trim().replace(/^\.\/?/, ''))
      .filter(Boolean)
  );
}

/*
 * La politique de complétude vit dans scripts/lib/car-verdict.mjs, avec les
 * raisons qui la rendent volontairement sans exception. Elle est là-bas et pas
 * ici pour une raison mécanique : ce fichier appelle `process.exit()` à son plus
 * haut niveau, donc un test qui l'importerait tuerait le worker. La décision la
 * plus conséquente de la chaîne — le dernier contrôle avant l'épinglage — était
 * aussi la seule à n'avoir aucun test.
 */

// ── Exécution ──────────────────────────────────────────────────────────────

/** Renvoie le code de sortie. Ne sort jamais lui-même — voir l'appel plus bas. */
function verifier(car, attendu) {
  const cid = String(execFileSync('npx', ['ipfs-car', 'pack', 'dist', '--no-wrap', '--output', car], {
    cwd: ROOT,
    shell: true,
  })).trim();

  console.log(`CID : ${cid}`);

  const surDisque = arbre(DIST);
  const dansLeCar = contenuDuCar(car);
  const absents = [...surDisque].filter((p) => !dansLeCar.has(p)).sort();
  const enTrop = [...dansLeCar].filter((p) => !surDisque.has(p)).sort();

  console.log(`${surDisque.size} entrées dans dist/, ${dansLeCar.size} dans le CAR.`);

  const verdict = verdictSurLesEcarts(absents, enTrop);
  if (verdict) {
    console.error(`\n✗ ${verdict}`);
    if (absents.length) {
      console.error(`\nDans dist/ mais absents du miroir :\n  ${absents.join('\n  ')}`);
      console.error(
        "\nipfs-car écarte par défaut les chemins commençant par « . ». Ces fichiers\n" +
          'seraient servis par Cloudflare et introuvables sur IPFS — et les deux jobs\n' +
          'calculeraient malgré tout le même CID, sans rien signaler.'
      );
    }
    if (enTrop.length) console.error(`\nDans le CAR mais absents de dist/ :\n  ${enTrop.join('\n  ')}`);
    return 1;
  }

  if (attendu !== undefined && cid !== attendu) {
    console.error('\n✗ Le CID ne correspond pas aux octets validés par les tests.');
    console.error(`  attendu (build-and-test) : ${attendu}`);
    console.error(`  obtenu  (ici)            : ${cid}`);
    console.error(
      "\nL'arbre dist/ épinglé n'est pas celui qui a été testé. Le transit par\n" +
        "l'artifact GitHub est le suspect le plus probable. Épingler malgré tout\n" +
        'publierait sous le nom IPNS un contenu que rien n’a validé.'
    );
    return 1;
  }

  if (attendu !== undefined) console.log('✓ CID identique à celui des octets validés.');

  // Consommé par `outputs.cid` du job build-and-test, d'où part la comparaison.
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `cid=${cid}\n`);

  return 0;
}

if (!existsSync(DIST)) {
  console.error('dist/ est absent : lancer `npm run build` avant ce script.');
  process.exit(1);
}

let attendu;
let sortie;
try {
  attendu = argument('--expect');
  sortie = argument('--output');
} catch (erreur) {
  // Une trace de pile nue à la place du diagnostic ferait perdre du temps à
  // quelqu'un qui lit des logs CI : la cause est ici, pas dans Node.
  console.error(`✗ ${erreur.message}`);
  console.error(
    "\nEn CI, cela signale presque toujours que `outputs.cid` du job build-and-test\n" +
      "n'est pas câblé : l'expression GitHub se résout à la chaîne vide."
  );
  process.exit(1);
}

/*
 * Même précaution que dans check-reproducible.mjs : `process.exit()` n'exécute
 * pas les `finally` en attente. Le code de retour se calcule d'abord, le
 * nettoyage suit, la sortie vient en dernier.
 */
const jetable = sortie ? null : mkdtempSync(join(tmpdir(), 'w00-cid-'));
let code;
try {
  code = verifier(sortie ?? join(jetable, 'w00.car'), attendu);
} finally {
  if (jetable) rmSync(jetable, { recursive: true, force: true });
}
process.exit(code);

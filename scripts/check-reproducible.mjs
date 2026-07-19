#!/usr/bin/env node
/**
 * Couche 3 de la reproductibilité : la vérité terrain.
 *
 * src/tests/reproducibility.test.ts couvre deux angles depuis vitest — le scan
 * statique des sources, et le double appel de chaque route. Aucun des deux ne
 * voit ce qui se passe *après* les routes : le pipeline Astro, le hachage des
 * noms d'assets, @playform/compress. Seul un vrai build peut trancher.
 *
 * Protocole : rebâtir dans un répertoire jetable et comparer au dist/ existant,
 * plutôt que bâtir deux fois. Deux raisons.
 *   1. Un build de moins.
 *   2. Surtout : dist/ vient d'être validé par `npm run test:dist`. L'écraser
 *      pour une comparaison remplacerait des octets vérifiés par des octets qui
 *      ne le sont pas, juste avant que le job ipfs les épingle.
 *
 * Ce que ce script mesure exactement : « le même arbre de sources, bâti deux
 * fois, donne-t-il les mêmes octets ». Il ne prétend pas que deux commits
 * différents donnent le même CID — dist/build.json contient GITHUB_SHA, et c'est
 * voulu. La contrainte est que les octets ne varient QUE par des entrées
 * déclarées.
 */
import { readdirSync, readFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decrireDifference } from './lib/diff-octets.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

function parcourir(dir, trouves = []) {
  for (const entree of readdirSync(dir, { withFileTypes: true })) {
    const complet = join(dir, entree.name);
    if (entree.isDirectory()) parcourir(complet, trouves);
    else trouves.push(complet);
  }
  return trouves;
}

/** Chemin relatif normalisé → octets. Séparateurs unifiés : ce script tourne sous Windows et sous Linux. */
function empreintes(racine) {
  const carte = new Map();
  for (const fichier of parcourir(racine)) {
    carte.set(relative(racine, fichier).replace(/\\/g, '/'), readFileSync(fichier));
  }
  return carte;
}

/*
 * Le diagnostic d'écart vit dans scripts/lib/diff-octets.mjs, avec l'argument
 * qui l'a fait remplacer un simple relevé de tailles : les défauts de
 * reproductibilité attendus ici conservent presque tous la longueur du fichier.
 * Il est là-bas et pas ici pour la même raison mécanique que la politique du
 * CAR — ce fichier appelle `process.exit()` à son plus haut niveau, donc un test
 * qui l'importerait tuerait le worker vitest.
 *
 * Le paramètre `rel` a disparu de sa signature : il ne servait qu'à deviner le
 * type du fichier, et le renifleur d'octet NUL le fait sans table d'extensions
 * à tenir à jour. L'appelant préfixe toujours le chemin lui-même.
 */

// ── Exécution ──────────────────────────────────────────────────────────────

if (!existsSync(DIST)) {
  console.error('dist/ est absent : lancer `npm run build` avant ce script.');
  process.exit(1);
}

/** Renvoie le code de sortie. Ne sort jamais lui-même — voir l'appel plus bas. */
function comparer(ailleurs) {
  console.log(`Rebuild dans ${ailleurs}…`);
  try {
    execSync(`npx astro build --outDir "${ailleurs}"`, { cwd: ROOT, stdio: 'pipe' });
  } catch (erreur) {
    // `stdio: 'pipe'` garde la sortie d'Astro hors des logs tant que tout va
    // bien. Le jour où le build casse, c'est la seule chose utile à lire : la
    // relayer, sinon la CI n'affiche qu'un « Command failed » sans cause.
    console.error('Le rebuild a échoué — ce n’est pas un défaut de reproductibilité.\n');
    console.error(`${erreur.stdout ?? ''}${erreur.stderr ?? ''}`.trim());
    return 1;
  }

  const temoin = empreintes(DIST);
  const rebati = empreintes(ailleurs);
  const tous = [...new Set([...temoin.keys(), ...rebati.keys()])].sort();

  const presence = [];
  const octets = [];

  for (const rel of tous) {
    const a = temoin.get(rel);
    const b = rebati.get(rel);
    if (!a) presence.push(`${rel} — apparu au rebuild, absent de dist/`);
    else if (!b) presence.push(`${rel} — présent dans dist/, disparu au rebuild`);
    else if (createHash('sha256').update(a).digest('hex') !== createHash('sha256').update(b).digest('hex')) {
      octets.push(`${rel} — ${decrireDifference(a, b)}`);
    }
  }

  console.log(`${tous.length} fichiers comparés.`);

  if (!presence.length && !octets.length) {
    console.log('✓ Build reproductible : octets identiques, le CID IPFS est stable.');
    return 0;
  }

  console.error('\n✗ Build NON reproductible — le CID changerait sans changement de contenu.');
  if (presence.length) console.error(`\nPrésence instable :\n  ${presence.join('\n  ')}`);
  if (octets.length) console.error(`\nOctets instables :\n  ${octets.join('\n  ')}`);
  console.error(
    '\nCause la plus probable : une lecture d’horloge ou une source d’aléa dans un\n' +
      'chemin de rendu. src/tests/reproducibility.test.ts en attrape la plupart ;\n' +
      'ce qui passe entre ses mailles se trouve ici.'
  );
  return 1;
}

/*
 * `process.exit()` termine le processus sans exécuter les `finally` en attente :
 * sortir depuis l'intérieur du bloc abandonnerait un arbre dist/ complet dans le
 * répertoire temporaire à *chaque* exécution, y compris quand tout va bien.
 * D'où le code de retour calculé d'abord, le nettoyage ensuite, la sortie enfin.
 */
const ailleurs = mkdtempSync(join(tmpdir(), 'w00-repro-'));
let code;
try {
  code = comparer(ailleurs);
} finally {
  rmSync(ailleurs, { recursive: true, force: true });
}
process.exit(code);

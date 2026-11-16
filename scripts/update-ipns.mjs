#!/usr/bin/env node
/**
 * Publie le nom IPNS du site sur Filebase → /ipfs/<CID>, PUIS relit le nom —
 * par l'API et par la passerelle — pour vérifier qu'il désigne bien ce qui
 * vient d'être publié. Avec `--depuis-log`, ne publie rien : surveille.
 *
 * Usage : node scripts/update-ipns.mjs <CID>
 *         node scripts/update-ipns.mjs --depuis-log <chemin/CIDS.log>
 * Env   : FILEBASE_KEY, FILEBASE_SECRET (les secrets de l'épinglage)
 *         FILEBASE_IPNS_LABEL (facultatif, « w00-board » par défaut)
 *
 * Le nom a été créé une fois par scripts/creer-nom-ipns.mjs ; la clé privée
 * IPNS reste chez Filebase, qui signe chaque enregistrement.
 *
 * Appelé par :
 *  - le job `ipfs` de deploy.yml, avec le CID explicite que Filebase vient
 *    d'épingler — déjà vérifié par `check:cid --expect` contre les octets
 *    testés dans build-and-test.
 *  - le cron quotidien de heartbeat.yml, avec `--depuis-log` : SURVEILLANCE
 *    SEULE. Un enregistrement Filebase n'est valable que 48 h
 *    (https://filebase.com/docs/ipfs/ipns-names), et republier le même CID ne
 *    le prolonge pas : Filebase répond 200 sans signer d'enregistrement neuf
 *    (mesuré le 2026-11-15, séquence 1 → 1). Filebase re-signe en revanche
 *    l'enregistrement de lui-même (mesuré le 2026-11-16, non documenté). Le
 *    heartbeat vérifie donc que le nom désigne le dernier CID épinglé et lui
 *    reste valide au moins MARGE_VALIDITE ; sinon il échoue, avant l'expiration.
 *
 * POURQUOI LE JOURNAL. Le heartbeat n'a rien à épingler. Il calculait jadis
 * son propre CID (`npx ipfs-car pack`) sans le confronter à rien ; le jour où
 * ce pack aurait divergé de celui de deploy.yml, il aurait validé un CID que
 * personne n'a épinglé. `--depuis-log` supprime cette seconde source de
 * vérité : l'attendu est ce que CIDS.log atteste, rien d'autre.
 *
 * Sécurité : le nom public (network_key) du label Filebase DOIT correspondre à
 * la constante IPNS_NAME de src/data/ipfs.ts — sinon on refuse de publier
 * (label ou compte erroné = on mettrait à jour un autre nom que celui affiché
 * au site).
 *
 * Pourquoi la relecture : l'étape qui appelle ce script dans deploy.yml porte
 * `continue-on-error: true`. C'est justifié — un miroir muet ne doit pas casser
 * un déploiement réussi — mais cela veut dire que son échec ne se voit que dans
 * les logs. Un échec silencieux et un échec signalé ne sont pas la même chose :
 * le verdict de relecture part donc dans $GITHUB_OUTPUT, et le résumé du job
 * l'affiche dans les deux cas. Voir scripts/lib/ipns-verdict.mjs pour les trois
 * contrôles (API, séquence, passerelle) et la raison de chacun.
 */
import fs from 'node:fs';
import path from 'node:path';
import { API_NOMS, PASSERELLE, enteteFilebase } from './lib/filebase-ipns.mjs';
import { racineServie, validiteDuRecord, verdictDeRelecture, verdictDeSurveillance } from './lib/ipns-verdict.mjs';
import { verdictSurLeJournal } from './lib/journal-verdict.mjs';

/**
 * Publie le verdict à destination du résumé de job.
 *
 * Écrit sur TOUS les chemins, succès comme échec : une sortie absente doit
 * pouvoir se distinguer d'une sortie « vérifié ». deploy.yml traite l'absence
 * comme un problème, jamais comme un silence rassurant.
 */
function rapporter(verifie, resume) {
  if (!process.env.GITHUB_OUTPUT) return;
  const ligne = String(resume).replace(/[\r\n]+/g, ' ').trim();
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `verified=${verifie}\nresume=${ligne}\n`);
}

/** Sortie en erreur, verdict compris. */
function abandonner(message, ...lignes) {
  console.error(`✗ ${message}`);
  for (const l of lignes) console.error(l);
  rapporter(false, message);
  process.exit(1);
}

/**
 * Le seul CID que le heartbeat ait le droit de republier : celui que CIDS.log
 * atteste comme épinglé.
 *
 * Toute anomalie arrête la publication — y compris un journal vide, qui à cet
 * endroit précis ne peut plus signifier « dépôt neuf ». La démonstration, et les
 * deux propriétés de workflow dont elle dépend, sont dans
 * scripts/lib/journal-verdict.mjs ; le cas du dépôt neuf est absorbé en amont
 * par la garde `git ls-remote` de heartbeat.yml, qui rend `verified=skipped`
 * sans jamais lancer ce script.
 */
function cidDepuisLeJournal(fichier) {
  const contenu = fs.existsSync(fichier) ? fs.readFileSync(fichier, 'utf8') : null;
  const verdict = verdictSurLeJournal(contenu, fichier);

  if (verdict.action === 'publier') {
    console.log(`✓ ${verdict.resume}`);
    for (const d of verdict.details) console.log(`  ${d}`);
    return verdict.cid;
  }

  abandonner(verdict.resume, ...verdict.details.map((d) => `  ${d}`));
}

const args = process.argv.slice(2);
const iJournal = args.indexOf('--depuis-log');

let cid;
if (iJournal !== -1) {
  const fichier = args[iJournal + 1];
  if (!fichier || fichier.startsWith('--')) {
    abandonner('--depuis-log attend un chemin de fichier.', '  Ex. : --depuis-log history/CIDS.log');
  }
  cid = cidDepuisLeJournal(fichier);
} else {
  cid = args[0];
}

// CIDv1 base32 (bafy..., produit par ipfs-car) — garde-fou contre un argument vide/corrompu
if (!cid || !/^bafy[a-z2-7]{50,}$/.test(cid)) {
  abandonner(
    'CID absent ou malformé.',
    '  Usage : node scripts/update-ipns.mjs <CID-v1-base32>',
    '          node scripts/update-ipns.mjs --depuis-log <chemin/CIDS.log>',
    '  En CI, une chaîne vide signale presque toujours que `steps.pack.outputs.cid`',
    "  n'est pas câblé : l'expression GitHub se résout au vide."
  );
}

const { FILEBASE_KEY, FILEBASE_SECRET } = process.env;
if (!FILEBASE_KEY || !FILEBASE_SECRET) {
  abandonner('Variables FILEBASE_KEY / FILEBASE_SECRET absentes (secrets GitHub non configurés).');
}
const LABEL = process.env.FILEBASE_IPNS_LABEL || 'w00-board';
const ENTETES = enteteFilebase(FILEBASE_KEY, FILEBASE_SECRET);

// Nom public attendu — lu depuis la source de vérité du site (src/data/ipfs.ts)
const ipfsTs = fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'ipfs.ts'), 'utf8');
const expectedName = ipfsTs.match(/IPNS_NAME = '([a-z0-9]+)'/)?.[1];
if (!expectedName) {
  abandonner('Impossible de lire IPNS_NAME dans src/data/ipfs.ts');
}

/**
 * Entrée du label dans l'API Filebase, ou null s'il n'y figure pas.
 *
 * Toute réponse autre que 200 LÈVE : une panne de l'API ne doit pas se lire
 * « nom absent ». Format mesuré le 2026-11-15 (GET /v1/names) : tableau de
 * { enabled, label, network_key, cid, sequence, published_at, created_at,
 * updated_at }.
 */
async function lireEntree() {
  const reponse = await fetch(API_NOMS, { headers: ENTETES, signal: AbortSignal.timeout(30_000) });
  if (!reponse.ok) throw new Error(`GET ${API_NOMS} → HTTP ${reponse.status}`);
  const liste = await reponse.json();
  if (!Array.isArray(liste)) throw new Error('réponse inattendue : un tableau de noms était attendu');
  return liste.find((n) => n?.label === LABEL) ?? null;
}

/**
 * CID que la passerelle sert sous le nom, ou null si elle ne le résout pas.
 * Le paramètre de requête évite une réponse HTTP mise en cache
 * (Cache-Control: max-age=300 mesuré) ; il n'agit pas sur le cache IPNS de la
 * passerelle, d'où la fenêtre de relecture ci-dessous.
 */
async function lireRacine() {
  try {
    const url = `${PASSERELLE}/ipns/${expectedName}/build.json?relecture=${Date.now()}`;
    const reponse = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    await reponse.arrayBuffer();
    return reponse.ok ? racineServie(reponse.headers.get('x-ipfs-roots')) : null;
  } catch {
    return null;
  }
}

/**
 * Échéance de l'enregistrement tel que le routage IPFS le distribue, ou null.
 *
 * delegated-ipfs.dev (routage délégué public, spec IPFS « Delegated Routing
 * V1 ») ne reçoit que le nom public. Un nom inconnu y répond HTTP 200 avec le
 * texte « delegate error: routing: not found » (mesuré le 2026-11-16) : c'est
 * validiteDuRecord qui le rejette, pas le code HTTP.
 */
async function lireValidite() {
  try {
    const reponse = await fetch(`https://delegated-ipfs.dev/routing/v1/ipns/${expectedName}`, {
      headers: { Accept: 'application/vnd.ipfs.ipns-record' },
      signal: AbortSignal.timeout(60_000),
    });
    const octets = new Uint8Array(await reponse.arrayBuffer());
    return reponse.ok ? validiteDuRecord(octets) : null;
  } catch {
    return null;
  }
}

/**
 * Seuil d'alerte du heartbeat. Le cron est quotidien : 24 h de marge garantit
 * au moins une alerte avant l'expiration, avec le temps de déployer.
 */
const MARGE_VALIDITE = 24 * 3_600_000;

/**
 * Mode heartbeat : lit, ne publie pas. Deux relectures supplémentaires
 * absorbent une passerelle ou un routage momentanément injoignable ; une
 * échéance proche, elle, ne s'arrangera pas en attendant, mais le coût d'une
 * minute et demie ne justifie pas un cas à part.
 */
async function surveiller() {
  const ATTENTES = [30, 60].map((s) => s * 1000);
  let verdict;
  for (let essai = 0; ; essai++) {
    let entree = null;
    try {
      entree = await lireEntree();
    } catch (erreur) {
      console.log(`  … lecture ${essai + 1} de l'API en erreur (${erreur?.message ?? erreur})`);
    }
    const [racine, validite] = await Promise.all([lireRacine(), lireValidite()]);
    verdict = verdictDeSurveillance({
      cid,
      nom: expectedName,
      entree,
      racine,
      validite,
      maintenant: new Date(),
      margeMs: MARGE_VALIDITE,
    });
    if (verdict.ok || essai >= ATTENTES.length) break;
    console.log(`  … non conforme (${verdict.code}), nouvelle lecture dans ${ATTENTES[essai] / 1000} s`);
    await new Promise((r) => setTimeout(r, ATTENTES[essai]));
  }

  console.log(`  ${PASSERELLE}/ipns/${expectedName}/`);
  if (verdict.ok) {
    console.log(`✓ ${verdict.resume}`);
    rapporter(true, verdict.resume);
    process.exit(0);
  }
  console.error(`\n✗ ${verdict.resume}`);
  for (const d of verdict.details) console.error(`  ${d}`);
  rapporter(false, verdict.resume);
  process.exit(1);
}

let avant;
try {
  avant = await lireEntree();
} catch (erreur) {
  abandonner(`Lecture du nom sur Filebase impossible : ${erreur?.message ?? erreur}`);
}
if (!avant) {
  abandonner(
    `Le label « ${LABEL} » n'existe pas sur le compte Filebase.`,
    '  Le créer une seule fois : node scripts/creer-nom-ipns.mjs <CID>',
    '  puis reporter son network_key dans src/data/ipfs.ts (IPNS_NAME).'
  );
}
if (avant.network_key !== expectedName) {
  abandonner(
    'Le label Filebase ne correspond pas au nom public du site.',
    `    Filebase → ${avant.network_key}`,
    `    site     → ${expectedName}`,
    '  Publication refusée (le footer pointerait vers un autre nom).'
  );
}

if (iJournal !== -1) await surveiller();

let miseAJour;
try {
  miseAJour = await fetch(`${API_NOMS}/${encodeURIComponent(LABEL)}`, {
    method: 'PUT',
    headers: { ...ENTETES, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cid }),
    signal: AbortSignal.timeout(30_000),
  });
} catch (erreur) {
  abandonner(`Mise à jour du nom impossible : ${erreur?.message ?? erreur}`);
}
if (!miseAJour.ok) {
  abandonner(
    `Filebase a refusé la mise à jour du nom (HTTP ${miseAJour.status}).`,
    `  ${(await miseAJour.text()).slice(0, 300)}`
  );
}
await miseAJour.arrayBuffer().catch(() => {});

console.log(`✓ Mise à jour acceptée par Filebase (seq avant : ${avant.sequence})`);
console.log(`  ipns://${expectedName}`);
console.log(`  → /ipfs/${cid}`);

/*
 * Relecture. La passerelle garde un nom résolu en cache jusqu'à son TTL
 * (5 min selon la doc Filebase) : la fenêtre est donc BORNÉE à ~6 min, plutôt
 * qu'infinie dans un job CI. Une tentative qui abandonne le dit — elle ne
 * retombe jamais dans le silence qu'on cherche justement à supprimer.
 */
const ATTENTES = [15, 30, 60, 60, 60, 60, 60].map((s) => s * 1000);
let verdict;
for (let essai = 0; ; essai++) {
  let apres = null;
  try {
    apres = await lireEntree();
  } catch (erreur) {
    // Panne de l'API pendant la relecture : on retente, puis on l'avoue.
    console.log(`  … relecture ${essai + 1} en erreur (${erreur?.message ?? erreur})`);
  }
  const racine = await lireRacine();
  verdict = verdictDeRelecture({ cid, nom: expectedName, avant, apres, racine });
  if (verdict.ok || essai >= ATTENTES.length) break;
  console.log(`  … relu non conforme (${verdict.code}), nouvelle tentative dans ${ATTENTES[essai] / 1000} s`);
  await new Promise((r) => setTimeout(r, ATTENTES[essai]));
}

console.log(`  ${PASSERELLE}/ipns/${expectedName}/`);

if (verdict.ok) {
  console.log(`✓ ${verdict.resume}`);
  rapporter(true, verdict.resume);
  process.exit(0);
}

console.error(`\n✗ ${verdict.resume}`);
for (const d of verdict.details) console.error(`  ${d}`);
console.error(
  '\nLe contenu reste épinglé et joignable par son CID direct ; seul le nom\n' +
    'stable est en cause. Dernier CID connu : branche ipfs-history (CIDS.log).'
);
rapporter(false, verdict.resume);
process.exit(1);

#!/usr/bin/env node
/**
 * Publie (ou republie) l'enregistrement IPNS w3name → /ipfs/<CID>, PUIS relit le
 * nom pour vérifier qu'il désigne bien ce qui vient d'être signé.
 *
 * Usage : node scripts/update-ipns.mjs <CID>
 *         node scripts/update-ipns.mjs --depuis-log <chemin/CIDS.log>
 * Env   : W3NAME_KEY = clé privée Ed25519 en base64 (secret GitHub)
 *
 * Appelé par :
 *  - le job `ipfs` de deploy.yml, avec le CID explicite que `w3 up` vient
 *    d'épingler — déjà vérifié par `check:cid --expect` contre les octets
 *    testés dans build-and-test.
 *  - le cron heartbeat.yml, avec `--depuis-log` (les enregistrements IPNS
 *    expirent : validité 1 an côté w3name, mais une republication régulière
 *    garde le nom chaud).
 *
 * POURQUOI DEUX MODES. Le heartbeat n'a rien à épingler : il rafraîchit un
 * enregistrement qui doit désigner du contenu DÉJÀ épinglé. Il calculait
 * pourtant son propre CID (`npx ipfs-car pack`) sans le confronter à rien. Le
 * jour où ce pack divergerait de celui de deploy.yml — une option, une version
 * d'ipfs-car — le nom pointerait vers un CID que personne n'a épinglé : il
 * résoudrait, la relecture ci-dessous serait verte (elle vérifie que le nom
 * désigne ce qu'on a signé, pas que ce contenu existe), et les passerelles ne
 * trouveraient rien. `--depuis-log` supprime la seconde source de vérité : le
 * heartbeat ne peut plus republier que ce que CIDS.log atteste.
 *
 * Sécurité : le nom public reconstruit depuis la clé DOIT correspondre à la
 * constante IPNS_NAME de src/data/ipfs.ts — sinon on refuserait de publier
 * (secret erroné = on signerait pour un autre nom que celui affiché au site).
 *
 * Pourquoi la relecture : l'étape qui appelle ce script dans deploy.yml porte
 * `continue-on-error: true`. C'est justifié — un miroir muet ne doit pas casser
 * un déploiement réussi — mais cela veut dire que son échec ne se voit que dans
 * les logs. Un échec silencieux et un échec signalé ne sont pas la même chose :
 * le verdict de relecture part donc dans $GITHUB_OUTPUT, et le résumé du job
 * l'affiche dans les deux cas. Voir scripts/lib/ipns-verdict.mjs pour les deux
 * contrôles (valeur ET séquence) et la raison du second.
 */
import * as Name from 'w3name';
import fs from 'node:fs';
import path from 'node:path';
import { verdictDeRelecture } from './lib/ipns-verdict.mjs';
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

const keyB64 = process.env.W3NAME_KEY;
if (!keyB64) {
  abandonner('Variable W3NAME_KEY absente (secret GitHub non configuré).');
}

// Nom public attendu — lu depuis la source de vérité du site (src/data/ipfs.ts)
const ipfsTs = fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'ipfs.ts'), 'utf8');
const expectedName = ipfsTs.match(/IPNS_NAME = '([a-z0-9]+)'/)?.[1];
if (!expectedName) {
  abandonner('Impossible de lire IPNS_NAME dans src/data/ipfs.ts');
}

const name = await Name.from(Buffer.from(keyB64, 'base64'));
if (name.toString() !== expectedName) {
  abandonner(
    'La clé W3NAME_KEY ne correspond pas au nom public du site.',
    `    clé   → ${name.toString()}`,
    `    site  → ${expectedName}`,
    '  Publication refusée (le footer pointerait vers un autre nom).'
  );
}

const value = `/ipfs/${cid}`;

/**
 * Résout le nom, ou renvoie null s'il n'existe pas encore.
 *
 * `Name.resolve` lève dans les deux cas — enregistrement absent ET panne
 * réseau — et l'ancienne version les confondait dans un `catch` nu. La
 * différence est lourde : « absent » justifie un premier enregistrement (v0,
 * séquence 0) ; une panne réseau, elle, ferait retomber sur v0 alors qu'un
 * enregistrement existe, avec une séquence en régression. On ne distingue donc
 * plus par le succès mais par le message, et tout le reste remonte.
 */
async function resoudreOuNull(n) {
  try {
    return await Name.resolve(n);
  } catch (erreur) {
    if (/record not found/i.test(erreur?.message ?? '')) return null;
    throw erreur;
  }
}

// Premier enregistrement (v0) ou incrément du numéro de séquence existant
let revision;
const actuel = await resoudreOuNull(name);
if (actuel) {
  revision = await Name.increment(actuel, value);
  console.log(`↻ Enregistrement existant (seq ${actuel.sequence}) → seq ${revision.sequence}`);
} else {
  revision = await Name.v0(name, value);
  console.log('✦ Premier enregistrement IPNS (v0)');
}

await Name.publish(revision, name.key);

console.log('✓ Publication émise');
console.log(`  ipns://${name.toString()}`);
console.log(`  → ${value}`);

/*
 * Relecture. Le service peut mettre un instant à servir ce qu'il vient
 * d'accepter ; on lui laisse une fenêtre BORNÉE (~14 s au total) plutôt que
 * d'attendre indéfiniment dans un job CI. Une tentative qui abandonne le dit —
 * elle ne retombe jamais dans le silence qu'on cherche justement à supprimer.
 */
const ATTENTES = [2000, 4000, 8000];
let verdict;
for (let essai = 0; ; essai++) {
  let relu = null;
  try {
    relu = await resoudreOuNull(name);
  } catch (erreur) {
    // Panne réseau pendant la relecture : on retente, puis on l'avoue.
    console.log(`  … relecture ${essai + 1} en erreur (${erreur?.message ?? erreur})`);
  }
  verdict = verdictDeRelecture(revision, relu);
  if (verdict.ok || essai >= ATTENTES.length) break;
  console.log(`  … relu non conforme (${verdict.code}), nouvelle tentative dans ${ATTENTES[essai] / 1000} s`);
  await new Promise((r) => setTimeout(r, ATTENTES[essai]));
}

console.log(`  https://dweb.link/ipns/${name.toString()}`);

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

#!/usr/bin/env node
/**
 * Crée le nom IPNS du site sur Filebase — à exécuter UNE SEULE FOIS au setup.
 *
 * Usage : node scripts/creer-nom-ipns.mjs <CID> [label]
 * Env   : FILEBASE_KEY, FILEBASE_SECRET (les mêmes clés que l'épinglage)
 *
 * Le nom public k51… renvoyé par Filebase (`network_key`) se reporte ensuite
 * dans src/data/ipfs.ts (IPNS_NAME). La clé privée IPNS reste chez Filebase :
 * il n'y a rien d'autre à conserver. Les déploiements mettent ensuite le nom à
 * jour par scripts/update-ipns.mjs (PUT /v1/names/<label>).
 *
 * API : https://filebase.com/docs/ipfs/ipns-names — offre gratuite : 1 nom.
 * Les réponses sont affichées telles quelles (elles ne contiennent pas les
 * clés d'accès) : le format n'est documenté que pour `network_key`.
 */
import { enteteFilebase, API_NOMS } from './lib/filebase-ipns.mjs';

const [cid, label = 'w00-board'] = process.argv.slice(2);

if (!cid || !/^bafy[a-z2-7]{50,}$/.test(cid)) {
  console.error('✗ CID absent ou malformé. Usage : node scripts/creer-nom-ipns.mjs <CID> [label]');
  process.exit(1);
}
const { FILEBASE_KEY, FILEBASE_SECRET } = process.env;
if (!FILEBASE_KEY || !FILEBASE_SECRET) {
  console.error('✗ Variables FILEBASE_KEY et FILEBASE_SECRET requises.');
  process.exit(1);
}

const entetes = {
  ...enteteFilebase(FILEBASE_KEY, FILEBASE_SECRET),
  'Content-Type': 'application/json',
};

const creation = await fetch(API_NOMS, {
  method: 'POST',
  headers: entetes,
  body: JSON.stringify({ label, cid }),
  signal: AbortSignal.timeout(30_000),
});
const corps = await creation.text();
console.log(`POST ${API_NOMS} → HTTP ${creation.status}`);
console.log(corps);

const liste = await fetch(API_NOMS, { headers: entetes, signal: AbortSignal.timeout(30_000) });
console.log(`\nGET ${API_NOMS} → HTTP ${liste.status}`);
console.log(await liste.text());

let cle = null;
try {
  cle = JSON.parse(corps)?.network_key ?? null;
} catch {
  // corps non JSON : déjà affiché ci-dessus
}
if (!creation.ok || !cle) {
  console.error(
    '\n✗ Nom non créé (ou network_key absent de la réponse) : voir les réponses ci-dessus.',
  );
  process.exit(1);
}
console.log(`\n✓ Nom IPNS créé : ${cle}`);
console.log('  À reporter dans src/data/ipfs.ts (IPNS_NAME).');

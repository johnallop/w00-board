#!/usr/bin/env node
/**
 * Génère une paire de clés w3name (IPNS) — à exécuter UNE SEULE FOIS au setup.
 *
 * - Affiche le nom public k51... (à coder en dur dans src/data/ipfs.ts)
 * - Écrit la clé privée (base64) dans w3name-key.SECRET.txt (gitignoré)
 *
 * Étapes après exécution :
 *   1. Copier le contenu de w3name-key.SECRET.txt dans le secret GitHub `W3NAME_KEY`
 *   2. Supprimer w3name-key.SECRET.txt
 *   ⚠️ Ne JAMAIS committer ce fichier — la clé privée permet de détourner le nom IPNS.
 *
 * Génération 100 % locale (Ed25519), aucun appel réseau.
 */
import * as Name from 'w3name';
import fs from 'node:fs';
import path from 'node:path';

const SECRET_FILE = path.join(process.cwd(), 'w3name-key.SECRET.txt');

if (fs.existsSync(SECRET_FILE)) {
  console.error(`✗ ${SECRET_FILE} existe déjà — suppression manuelle requise avant de régénérer.`);
  console.error('  (Régénérer une clé change le nom public k51... et casse tous les liens publiés.)');
  process.exit(1);
}

const name = await Name.create();
// name.key.raw = clé privée Ed25519 brute — Name.from() la ré-importe telle quelle
const privateKeyB64 = Buffer.from(name.key.raw).toString('base64');

// Vérification aller-retour : la clé exportée doit redonner exactement le même nom
const reimported = await Name.from(Buffer.from(privateKeyB64, 'base64'));
if (reimported.toString() !== name.toString()) {
  console.error('✗ Échec de vérification : la clé ré-importée ne redonne pas le même nom.');
  process.exit(1);
}

fs.writeFileSync(SECRET_FILE, privateKeyB64 + '\n', { mode: 0o600 });

console.log('✓ Paire de clés w3name générée (localement, hors-ligne)');
console.log('');
console.log(`Nom public IPNS : ${name.toString()}`);
console.log(`Clé privée      : écrite dans ${SECRET_FILE} (gitignoré)`);
console.log('');
console.log('Prochaines étapes :');
console.log('  1. Reporter le nom public dans src/data/ipfs.ts (constante IPNS_NAME)');
console.log('  2. Créer le secret GitHub W3NAME_KEY avec le contenu du fichier secret');
console.log('  3. Supprimer w3name-key.SECRET.txt');

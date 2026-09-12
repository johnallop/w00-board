/**
 * Publie le message du billboard sur Nostr via plusieurs relays publics.
 *
 * Secrets requis :
 *   NOSTR_PRIVATE_KEY
 */

import { finalizeEvent, Relay } from 'nostr-tools';

/**
 * Convertit une clé hexadécimale en octets.
 *
 * REMPLACE `hexToBytes` DE `@noble/hashes/utils`, qui était importé sans figurer
 * dans package.json : le paquet n'arrivait ici que par transitivité de
 * `nostr-tools`. Une montée de version qui change de bibliothèque de hachage, ou
 * un gestionnaire à isolation stricte (pnpm, Yarn PnP), faisait disparaître le
 * canal Nostr — en pointant un module que personne n'avait jamais déclaré.
 *
 * Déclarer la dépendance aurait aussi fermé le trou. Six lignes sans dépendance
 * coûtent moins à maintenir qu'une dépendance de plus pour une conversion, et
 * c'est l'ordre de préférence qu'impose AGENTS.md.
 *
 * La validation n'est pas décorative : `finalizeEvent` recevait auparavant tout
 * ce que la variable d'environnement contenait. Une clé tronquée produisait une
 * signature invalide, acceptée par le script et rejetée par les relais — donc un
 * échec dont le message ne nommait pas la cause.
 *
 * @param {string} hex
 * @returns {Uint8Array}
 */
function hexEnOctets(hex) {
  const nettoye = String(hex).trim().toLowerCase();
  if (!/^([0-9a-f]{2})+$/.test(nettoye)) {
    throw new Error(
      'NOSTR_PRIVATE_KEY doit être une chaîne hexadécimale de longueur paire ' +
        `(reçu : ${nettoye.length} caractère(s)).`
    );
  }
  return Uint8Array.from(nettoye.match(/.{2}/g), (octet) => parseInt(octet, 16));
}

/**
 * @param {object} params
 * @param {string} params.message
 * @param {string} params.author
 * @param {string} params.hashtags
 * @param {string} params.url
 * @returns {Promise<void>}
 */
export async function post({ message, author, hashtags, url }) {
  const { NOSTR_PRIVATE_KEY } = process.env;

  if (!NOSTR_PRIVATE_KEY) {
    throw new Error('Variable manquante : NOSTR_PRIVATE_KEY');
  }

  // Relays Nostr publics fiables
  const RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.snort.social',
  ];

  const tags = [
    ['t', 'billboard'],
    ['t', 'decentralise'],
    ['t', 'ipfs'],
  ];

  // Ajouter les hashtags extraits comme tags Nostr si présents
  if (hashtags) {
    const rawTags = hashtags.split(/\s+/).map(t => t.replace('#', '').trim()).filter(Boolean);
    for (const tag of rawTags) {
      tags.push(['t', tag.toLowerCase()]);
    }
  }

  const content = `📋 ${message}\n\n— ${author}\n${hashtags}\n\n🔗 ${url}`;

  const event = finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: tags,
      content: content,
    },
    hexEnOctets(NOSTR_PRIVATE_KEY)
  );

  let published = 0;

  await Promise.allSettled(
    RELAYS.map(async (relayUrl) => {
      try {
        const relay = await Relay.connect(relayUrl);
        await relay.publish(event);
        relay.close();
        published++;
        console.log(`✓ Publié sur ${relayUrl}`);
      } catch (err) {
        console.warn(`✗ Échec ${relayUrl} :`, err.message);
      }
    })
  );

  if (published === 0) {
    throw new Error("Aucun relay Nostr n'a accepté le message");
  }

  console.log(`✓ Message publié sur ${published}/${RELAYS.length} relays Nostr`);
}

// Exécution directe si lancé directement
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('post-nostr.mjs')) {
  const { MESSAGE, AUTHOR, HASHTAGS, SITE_URL } = process.env;
  if (!MESSAGE || !AUTHOR) {
    console.error('MESSAGE et AUTHOR requis en variables d\'environnement');
    process.exit(1);
  }
  post({
    message: MESSAGE,
    author: AUTHOR,
    hashtags: HASHTAGS || '#Billboard',
    url: SITE_URL || 'https://w00-board.pages.dev',
  }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}


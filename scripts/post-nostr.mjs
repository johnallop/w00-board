/**
 * Publie le message du billboard sur Nostr via plusieurs relays publics.
 *
 * Secrets requis :
 *   NOSTR_PRIVATE_KEY
 */

import { finalizeEvent, Relay } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';

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
    hexToBytes(NOSTR_PRIVATE_KEY)
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


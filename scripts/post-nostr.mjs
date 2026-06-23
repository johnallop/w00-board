/**
 * Publie le message du billboard sur Nostr via plusieurs relays publics.
 * Utilisé par .github/workflows/broadcast.yml
 *
 * Secrets GitHub requis :
 *   NOSTR_PRIVATE_KEY → clé privée hex (nsec converti en hex via snort.social ou nak)
 *   MESSAGE           → extrait automatiquement de config.json par le workflow
 */

import { finalizeEvent, Relay } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';

const { NOSTR_PRIVATE_KEY, MESSAGE } = process.env;

if (!NOSTR_PRIVATE_KEY || !MESSAGE) {
  console.error('Variables manquantes : NOSTR_PRIVATE_KEY, MESSAGE');
  process.exit(1);
}

// Relays Nostr publics fiables
const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
];

const siteUrl = process.env.SITE_URL ?? 'https://w00-board.pages.dev';

const event = finalizeEvent(
  {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', 'billboard'],
      ['t', 'décentralisé'],
      ['t', 'ipfs'],
    ],
    content: `📋 ${MESSAGE}\n\n— Panneau d'Affichage Décentralisé\n${siteUrl}`,
  },
  hexToBytes(NOSTR_PRIVATE_KEY)
);

let published = 0;

await Promise.allSettled(
  RELAYS.map(async (url) => {
    try {
      const relay = await Relay.connect(url);
      await relay.publish(event);
      relay.close();
      published++;
      console.log(`✓ Publié sur ${url}`);
    } catch (err) {
      console.warn(`✗ Échec ${url} :`, err.message);
    }
  })
);

if (published === 0) {
  console.error('Aucun relay Nostr n\'a accepté le message');
  process.exit(1);
}

console.log(`✓ Message publié sur ${published}/${RELAYS.length} relays Nostr`);

/**
 * Publie le message du billboard sur Bluesky via AT Protocol.
 * Utilisé par .github/workflows/broadcast.yml
 *
 * Secrets GitHub requis :
 *   BLUESKY_HANDLE   → ex: votrecompte.bsky.social
 *   BLUESKY_PASSWORD → mot de passe d'application Bluesky
 *   MESSAGE          → extrait automatiquement de config.json par le workflow
 */

import { BskyAgent } from '@atproto/api';

const { BLUESKY_HANDLE, BLUESKY_PASSWORD, MESSAGE } = process.env;

if (!BLUESKY_HANDLE || !BLUESKY_PASSWORD || !MESSAGE) {
  console.error('Variables manquantes : BLUESKY_HANDLE, BLUESKY_PASSWORD, MESSAGE');
  process.exit(1);
}

const agent = new BskyAgent({ service: 'https://bsky.social' });

try {
  await agent.login({ identifier: BLUESKY_HANDLE, password: BLUESKY_PASSWORD });

  const siteUrl = process.env.SITE_URL ?? 'https://w00-board.pages.dev';

  await agent.post({
    text: `📋 ${MESSAGE}\n\n— Panneau d'Affichage Décentralisé\n${siteUrl}`,
    createdAt: new Date().toISOString(),
  });

  console.log('✓ Message publié sur Bluesky');
} catch (err) {
  console.error('Erreur Bluesky :', err.message);
  process.exit(1);
}

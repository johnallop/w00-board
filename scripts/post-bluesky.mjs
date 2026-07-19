/**
 * Publie le message du billboard sur Bluesky via AT Protocol.
 *
 * Secrets requis :
 *   BLUESKY_HANDLE
 *   BLUESKY_PASSWORD
 */

import { AtpAgent } from '@atproto/api';

/**
 * @param {object} params
 * @param {string} params.message
 * @param {string} params.author
 * @param {string} params.hashtags
 * @param {string} params.url
 * @returns {Promise<void>}
 */
export async function post({ message, author, hashtags, url }) {
  const { BLUESKY_HANDLE, BLUESKY_PASSWORD } = process.env;

  if (!BLUESKY_HANDLE || !BLUESKY_PASSWORD) {
    throw new Error('Variables manquantes : BLUESKY_HANDLE ou BLUESKY_PASSWORD');
  }

  const agent = new AtpAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier: BLUESKY_HANDLE, password: BLUESKY_PASSWORD });

  const text = `📋 ${message}\n\n— ${author}\n${hashtags}\n\n🔗 ${url}`;

  // Tronquage si dépasse la limite de Bluesky (300 caractères)
  let postText = text;
  if (postText.length > 300) {
    const overflowText = '\n\n🔗 ' + url;
    const availableLength = 300 - overflowText.length - 4; // -4 pour '...'
    const trimmedMessage = message.slice(0, availableLength);
    postText = `📋 ${trimmedMessage}...\n\n— ${author}\n\n🔗 ${url}`;
  }

  await agent.post({
    text: postText,
    createdAt: new Date().toISOString(),
  });

  console.log('✓ Message publié sur Bluesky');
}

// Exécution directe si lancé directement
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('post-bluesky.mjs')) {
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


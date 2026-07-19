/**
 * Publie le message du billboard sur Mastodon.
 *
 * Secrets requis :
 *   MASTODON_TOKEN
 *   MASTODON_INSTANCE
 */

import { URLSearchParams } from 'url';

/**
 * @param {object} params
 * @param {string} params.message
 * @param {string} params.author
 * @param {string} params.hashtags
 * @param {string} params.url
 * @returns {Promise<void>}
 */
export async function post({ message, author, hashtags, url }) {
  const { MASTODON_TOKEN, MASTODON_INSTANCE } = process.env;

  if (!MASTODON_TOKEN || !MASTODON_INSTANCE) {
    throw new Error('Variables manquantes : MASTODON_TOKEN ou MASTODON_INSTANCE');
  }

  const statusText = `📋 ${message}\n\n— ${author}\n${hashtags}\n\n🔗 ${url}`;

  const body = new URLSearchParams();
  body.append('status', statusText);
  body.append('visibility', 'public');

  const response = await fetch(`${MASTODON_INSTANCE.replace(/\/$/, '')}/api/v1/statuses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MASTODON_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur HTTP Mastodon ${response.status} : ${errorText}`);
  }

  console.log('✓ Message publié sur Mastodon');
}

// Exécution directe si lancé directement
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('post-mastodon.mjs')) {
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

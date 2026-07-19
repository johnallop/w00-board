/**
 * Publie le message du billboard sur Telegram.
 *
 * Secrets requis :
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_CHAT_ID
 */

/**
 * @param {object} params
 * @param {string} params.message
 * @param {string} params.author
 * @param {string} params.hashtags
 * @param {string} params.url
 * @returns {Promise<void>}
 */
export async function post({ message, author, hashtags, url }) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('Variables manquantes : TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID');
  }

  /*
   * `url` était le seul des quatre champs interpolé BRUT dans une charge
   * `parse_mode: 'HTML'`. Il est construit à partir de `board.id`
   * (`${siteUrl}/b/${board.id}/`) : un id contenant « < » suffisait à produire
   * un balisage que l'API Telegram rejette en 400, faisant échouer le seul
   * canal dont le message était par ailleurs valide. Échapper les quatre
   * champs supprime la question de savoir lequel est « de confiance ».
   */
  const text = `📋 <b>${escapeHtml(message)}</b>\n\n— ${escapeHtml(author)}\n${escapeHtml(hashtags)}\n\n🔗 ${escapeHtml(url)}`;

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur HTTP Telegram ${response.status} : ${errorText}`);
  }

  console.log('✓ Message publié sur Telegram');
}

function escapeHtml(str) {
  // Un champ absent produisait « str.replace is not a function » — une trace de
  // pile au lieu du nom du champ fautif.
  if (typeof str !== 'string') {
    throw new TypeError(`Champ de message Telegram non textuel : ${JSON.stringify(str)}`);
  }
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Exécution directe si lancé directement
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('post-telegram.mjs')) {
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

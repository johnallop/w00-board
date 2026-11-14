/**
 * Publie le message du billboard sur Discord via Webhook.
 *
 * Secrets requis :
 *   DISCORD_WEBHOOK_URL
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
  const { DISCORD_WEBHOOK_URL } = process.env;

  if (!DISCORD_WEBHOOK_URL) {
    throw new Error('Variable manquante : DISCORD_WEBHOOK_URL');
  }

  const content = `📋 **${message}**\n\n— ${author}\n${hashtags}\n\n🔗 ${url}`;

  const response = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    // `parse: []` neutralise toutes les mentions (@everyone, @here, rôles,
    // personnes). Sans ce champ Discord les interprète toutes (doc « Allowed
    // Mentions ») : depuis que les panneaux peuvent venir de propositions
    // publiques (/creer/), un message contenant « @everyone » notifierait tout
    // le serveur.
    body: JSON.stringify({
      content: content,
      allowed_mentions: { parse: [] },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur HTTP Discord ${response.status} : ${errorText}`);
  }

  console.log('✓ Message publié sur Discord');
}

// Exécution directe si lancé directement
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('post-discord.mjs')) {
  const { MESSAGE, AUTHOR, HASHTAGS, SITE_URL } = process.env;
  if (!MESSAGE || !AUTHOR) {
    console.error('MESSAGE et AUTHOR requis en variables d\'environnement');
    process.exit(1);
  }
  post({
    message: MESSAGE,
    author: AUTHOR,
    hashtags: HASHTAGS || '#Billboard',
    url: SITE_URL || 'https://board.wooddyviat.com',
  }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

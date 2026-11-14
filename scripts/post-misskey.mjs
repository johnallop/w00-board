/**
 * Publie le message du billboard sur Misskey — et ses dérivés compatibles
 * (Sharkey, Firefish, Iceshrimp…), qui partagent l'API. Misskey fédère via
 * ActivityPub : le post est visible depuis Mastodon comme depuis Misskey.
 *
 * Secrets requis :
 *   MISSKEY_INSTANCE  ex. https://misskey.io
 *   MISSKEY_TOKEN     jeton d'accès avec la permission « Composer ou supprimer des notes »
 *
 * API : POST {instance}/api/notes/create, corps JSON { text }, jeton en
 * `Authorization: Bearer` (misskey-hub.net, « Using the API »). La visibilité
 * n'est pas transmise : la valeur par défaut de l'API est publique (non
 * revérifié — à contrôler sur la première note publiée).
 */

/**
 * @param {{message: string, author: string, hashtags: string, url: string}} p
 * @param {Record<string, string | undefined>} env
 * @returns {{url: string, init: {method: string, headers: Record<string, string>, body: string}}}
 */
export function construireRequete({ message, author, hashtags, url }, env) {
  const { MISSKEY_INSTANCE, MISSKEY_TOKEN } = env;
  if (!MISSKEY_INSTANCE || !MISSKEY_TOKEN) {
    throw new Error('Variables manquantes : MISSKEY_INSTANCE ou MISSKEY_TOKEN');
  }
  return {
    url: `${MISSKEY_INSTANCE.replace(/\/$/, '')}/api/notes/create`,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MISSKEY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: `📋 ${message}\n\n— ${author}\n${hashtags}\n\n🔗 ${url}` }),
    },
  };
}

/**
 * @param {{message: string, author: string, hashtags: string, url: string}} params
 * @returns {Promise<void>}
 */
export async function post(params) {
  const { url, init } = construireRequete(params, process.env);
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`Erreur HTTP Misskey ${response.status} : ${await response.text()}`);
  }
  console.log('✓ Note publiée sur Misskey');
}

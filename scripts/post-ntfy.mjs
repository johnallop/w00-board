/**
 * Pousse le message du billboard en notification via ntfy (logiciel libre,
 * auto-hébergeable, sans compte requis côté abonnés). Toute personne abonnée
 * au sujet reçoit l'affiche sur son téléphone ou son navigateur, sans réseau
 * social intermédiaire.
 *
 * Secrets :
 *   NTFY_TOPIC   (requis) nom du sujet — sur ntfy.sh, il est public : quiconque
 *                le connaît peut lire ET publier ; protéger le sujet par un
 *                jeton ou utiliser un serveur auto-hébergé.
 *   NTFY_SERVER  (optionnel) défaut https://ntfy.sh
 *   NTFY_TOKEN   (optionnel) jeton d'accès tk_…, envoyé en Authorization: Bearer
 *
 * API (docs.ntfy.sh/publish) : POST {serveur}/{sujet}, corps = message ;
 * en-têtes Title et Click. Le titre est encodé en RFC 2047 : un en-tête HTTP
 * ne porte pas d'UTF-8 brut côté fetch, et la doc ntfy accepte cette forme.
 */

/** Encode une valeur d'en-tête non ASCII (RFC 2047, base64). */
export function enteteRfc2047(valeur) {
  return /^[\x20-\x7e]*$/.test(valeur)
    ? valeur
    : `=?UTF-8?B?${Buffer.from(valeur, 'utf8').toString('base64')}?=`;
}

/**
 * @param {{message: string, author: string, hashtags: string, url: string}} p
 * @param {Record<string, string | undefined>} env
 * @returns {{url: string, init: {method: string, headers: Record<string, string>, body: string}}}
 */
export function construireRequete({ message, author, hashtags, url }, env) {
  const { NTFY_TOPIC, NTFY_SERVER, NTFY_TOKEN } = env;
  if (!NTFY_TOPIC) {
    throw new Error('Variable manquante : NTFY_TOPIC');
  }
  /** @type {Record<string, string>} */
  const headers = {
    Title: enteteRfc2047(`W00-Board — ${author}`),
    // URL ouverte au toucher de la notification ; ASCII par construction
    // (origine validée + id URL-safe).
    Click: url,
    'Content-Type': 'text/plain; charset=utf-8',
  };
  if (NTFY_TOKEN) headers.Authorization = `Bearer ${NTFY_TOKEN}`;
  return {
    url: `${(NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '')}/${encodeURIComponent(NTFY_TOPIC)}`,
    init: { method: 'POST', headers, body: `${message}\n\n${hashtags}\n${url}` },
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
    throw new Error(`Erreur HTTP ntfy ${response.status} : ${await response.text()}`);
  }
  console.log('✓ Notification envoyée via ntfy');
}

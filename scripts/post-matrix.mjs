/**
 * Publie le message du billboard dans un salon Matrix (protocole ouvert,
 * fédéré, auto-hébergeable).
 *
 * Secrets requis :
 *   MATRIX_HOMESERVER    ex. https://matrix.org
 *   MATRIX_ACCESS_TOKEN  jeton d'un compte bot (pas un compte personnel)
 *   MATRIX_ROOM_ID       identifiant interne du salon, ex. !abcdef:matrix.org
 *
 * API : PUT /_matrix/client/v3/rooms/{roomId}/send/m.room.message/{txnId},
 * jeton en `Authorization: Bearer` (spec Client-Server v1.11). Le bot doit
 * avoir rejoint le salon au préalable.
 *
 * Données envoyées : le texte publié, déjà public. Rien d'autre.
 */

/**
 * Requête prête à envoyer — pure, sans réseau, testée.
 *
 * @param {{message: string, author: string, hashtags: string, url: string}} p
 * @param {Record<string, string | undefined>} env
 * @param {string} txnId — identifiant de transaction ; le serveur ignore un renvoi du même id
 * @returns {{url: string, init: {method: string, headers: Record<string, string>, body: string}}}
 */
export function construireRequete({ message, author, hashtags, url }, env, txnId) {
  const { MATRIX_HOMESERVER, MATRIX_ACCESS_TOKEN, MATRIX_ROOM_ID } = env;
  if (!MATRIX_HOMESERVER || !MATRIX_ACCESS_TOKEN || !MATRIX_ROOM_ID) {
    throw new Error(
      'Variables manquantes : MATRIX_HOMESERVER, MATRIX_ACCESS_TOKEN ou MATRIX_ROOM_ID',
    );
  }
  const serveur = MATRIX_HOMESERVER.replace(/\/$/, '');
  const salon = encodeURIComponent(MATRIX_ROOM_ID);
  return {
    url: `${serveur}/_matrix/client/v3/rooms/${salon}/send/m.room.message/${encodeURIComponent(txnId)}`,
    init: {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${MATRIX_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      // Texte brut uniquement : pas de `formatted_body` HTML, donc rien à
      // échapper et aucun balisage injectable depuis la config.
      body: JSON.stringify({
        msgtype: 'm.text',
        body: `📋 ${message}\n\n— ${author}\n${hashtags}\n\n🔗 ${url}`,
      }),
    },
  };
}

/**
 * @param {{message: string, author: string, hashtags: string, url: string, cle?: string}} params
 * @returns {Promise<void>}
 */
export async function post(params) {
  // La spec rend un PUT idempotent par (jeton, txnId) : la clé partagée par les
  // tentatives d'un même run évite le doublon lors d'un « Re-run ».
  const txnId = params.cle ?? `w00-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const { url, init } = construireRequete(params, process.env, txnId);
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`Erreur HTTP Matrix ${response.status} : ${await response.text()}`);
  }
  console.log('✓ Message publié sur Matrix');
}

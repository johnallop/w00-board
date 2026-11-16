/**
 * Accès à l'API Filebase des noms IPNS (https://filebase.com/docs/ipfs/ipns-names).
 *
 * Authentification documentée : `Authorization: Bearer base64(KEY:SECRET)`,
 * avec la même paire de clés que l'épinglage S3.
 */

export const API_NOMS = 'https://api.filebase.io/v1/names';

/** Passerelle Filebase : résout les noms IPNS publiés par Filebase. */
export const PASSERELLE = 'https://ipfs.filebase.io';

/** En-tête d'authentification de l'API Filebase. */
export function enteteFilebase(cle, secret) {
  return { Authorization: `Bearer ${Buffer.from(`${cle}:${secret}`).toString('base64')}` };
}

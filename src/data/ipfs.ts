/**
 * Miroir IPFS — source de vérité unique pour les URL du miroir.
 *
 * IPNS_NAME est le nom public géré par Filebase (k51..., codé en dur
 * volontairement : il est stable tant que le nom « w00-board » existe sur le
 * compte Filebase, dont il est la clé publique). Le CID du site change à
 * chaque build, mais ce nom pointe toujours vers le dernier snapshot publié par
 * scripts/update-ipns.mjs (job `ipfs` du CI ; heartbeat.yml surveille son échéance de 48 h).
 *
 * ⚠️ Ne pas supprimer ni recréer le nom sur Filebase : un nouveau nom public
 * casserait tous les liens déjà diffusés. Création initiale :
 * scripts/creer-nom-ipns.mjs (2026-11-15).
 */
export const IPNS_NAME = 'k51qzi5uqu5dj2p76paxdtfrdr86kc6txooxipz0l3w4osuyn1rqlu919xrlyi';

/**
 * Passerelle principale : celle de Filebase, qui publie le nom et le résout
 * en HTTP simple (vérifié le 2026-11-15). Protocole natif : ipns://<IPNS_NAME>.
 */
export const IPNS_GATEWAY_URL = `https://ipfs.filebase.io/ipns/${IPNS_NAME}`;

/**
 * Passerelle de secours, indépendante de Filebase. dweb.link ne sert plus
 * qu'une passerelle « service worker » : elle fonctionne dans un navigateur,
 * pas avec curl (réponse 429 hors navigateur, constatée le 2026-11-15).
 */
export const IPNS_GATEWAY_FALLBACK_URL = `https://dweb.link/ipns/${IPNS_NAME}`;

/** Historique public des CID épinglés (branche orpheline, hors main). */
export const IPFS_HISTORY_URL = 'https://github.com/johnallop/w00-board/tree/ipfs-history';

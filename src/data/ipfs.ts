/**
 * Miroir IPFS — source de vérité unique pour les URL du miroir.
 *
 * IPNS_NAME est le nom public w3name (k51..., codé en dur volontairement :
 * il est stable à vie tant que la clé privée W3NAME_KEY ne change pas).
 * Le CID du site change à chaque build, mais ce nom pointe toujours vers
 * le dernier snapshot publié par scripts/update-ipns.mjs (job `ipfs` du CI).
 *
 * ⚠️ Ne pas régénérer la clé (scripts/generate-w3name-key.mjs) : un nouveau
 * nom public casserait tous les liens déjà diffusés.
 */
export const IPNS_NAME = 'k51qzi5uqu5djx9q0h131lbqfu69gldfkmq97vpo5g2b0kcmywo7t388uji933';

/** Passerelle publique principale (protocole natif : ipns://<IPNS_NAME>). */
export const IPNS_GATEWAY_URL = `https://dweb.link/ipns/${IPNS_NAME}`;

/** Passerelle de secours si dweb.link est indisponible. */
export const IPNS_GATEWAY_FALLBACK_URL = `https://w3s.link/ipns/${IPNS_NAME}`;

/** Historique public des CID épinglés (branche orpheline, hors main). */
export const IPFS_HISTORY_URL = 'https://github.com/johnallop/w00-board/tree/ipfs-history';

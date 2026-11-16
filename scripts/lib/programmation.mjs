/**
 * Période de diffusion d'un panneau : `startDate` / `endDate`, facultatifs.
 *
 * POURQUOI À L'AFFICHAGE ET PAS AU BUILD. Le build ne lit jamais l'heure : il
 * doit produire les mêmes octets pour le même commit (CID IPFS stable, voir
 * reproducibility.test.ts). Filtrer au build ferait dépendre le site du jour
 * de sa construction — et le site ne se reconstruit qu'au push. La décision
 * se prend donc là où une horloge existe : le navigateur du kiosque (/live) et
 * le heartbeat (rotation hebdomadaire).
 *
 * BORNES. `startDate` est inclusive. `endDate` aussi, au sens où on l'écrit :
 *  - « 2026-12-15 » (jour seul) couvre toute la journée UTC du 15 → la
 *    diffusion cesse le 16 à 00:00 UTC ;
 *  - « 2026-12-15T18:00:00Z » (avec heure) cesse à cet instant précis.
 * Un jour seul s'entend en UTC, comme `date` ailleurs dans le site ; un
 * décalage explicite (« …T00:00:00+01:00 ») permet de caler une autre heure.
 *
 * Module partagé : importé par src/pages/live.astro (navigateur),
 * scripts/lib/rotation.mjs (heartbeat) et src/utils/validateConfig.ts.
 * Fonctions pures — testées dans src/tests/programmation.test.ts.
 */

/** Même grammaire que `date` dans validateConfig : jour seul, ou heure AVEC fuseau. */
export const FORMAT_DATE_ISO =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/;

const JOUR_SEUL = /^\d{4}-\d{2}-\d{2}$/;
const UN_JOUR_MS = 86_400_000;

/**
 * Instant (ms) où la diffusion commence, ou null sans borne / borne illisible.
 * @param {unknown} valeur
 */
export function debutMs(valeur) {
  if (typeof valeur !== 'string' || !FORMAT_DATE_ISO.test(valeur)) return null;
  const ms = Date.parse(valeur);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Instant (ms) où la diffusion CESSE (borne exclusive), ou null.
 * Un jour seul couvre la journée entière : on renvoie le lendemain 00:00 UTC.
 * @param {unknown} valeur
 */
export function finMs(valeur) {
  const ms = debutMs(valeur);
  if (ms === null) return null;
  return JOUR_SEUL.test(/** @type {string} */ (valeur)) ? ms + UN_JOUR_MS : ms;
}

/**
 * Tout objet portant (ou non) une période : un panneau de config.json, ou les
 * `data-*` d'une diapositive de /live.
 * @typedef {{ startDate?: unknown, endDate?: unknown, [autre: string]: unknown }} Programmable
 */

/**
 * @param {Programmable} panneau
 * @param {Date} instant
 * @returns {'a-venir' | 'en-cours' | 'terminee'}
 */
export function etatDeDiffusion(panneau, instant) {
  const t = instant.getTime();
  const debut = debutMs(panneau?.startDate);
  const fin = finMs(panneau?.endDate);
  if (debut !== null && t < debut) return 'a-venir';
  if (fin !== null && t >= fin) return 'terminee';
  return 'en-cours';
}

/**
 * Une borne lisible par un humain, en UTC — comme la date de publication de
 * /b/<id>, pour que le rendu ne dépende pas de la machine de build.
 * @param {string} valeur borne déjà validée
 */
function borneLisible(valeur) {
  const jour = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(valeur),
  );
  if (JOUR_SEUL.test(valeur)) return jour;
  const heure = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short', timeZone: 'UTC' }).format(
    new Date(valeur),
  );
  return `${jour} à ${heure} UTC`;
}

/**
 * Phrase décrivant la période, ou null sans période. Statique : elle ne dit
 * PAS si la diffusion est en cours (le build ne connaît pas l'heure).
 * @param {{ startDate?: string, endDate?: string }} panneau
 * @returns {string | null}
 */
export function libellePeriode(panneau) {
  const debut =
    debutMs(panneau?.startDate) !== null
      ? borneLisible(/** @type {string} */ (panneau.startDate))
      : null;
  const fin =
    debutMs(panneau?.endDate) !== null
      ? borneLisible(/** @type {string} */ (panneau.endDate))
      : null;
  if (debut && fin) return `Diffusé du ${debut} au ${fin}`;
  if (debut) return `Diffusé à partir du ${debut}`;
  if (fin) return `Diffusé jusqu’au ${fin}`;
  return null;
}

/**
 * Le panneau doit-il être montré à cet instant ? Sans aucune borne : toujours.
 * @param {Programmable} panneau
 * @param {Date} instant
 */
export function estEnDiffusion(panneau, instant) {
  return etatDeDiffusion(panneau, instant) === 'en-cours';
}

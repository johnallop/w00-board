/**
 * Rotation SANS ÉTAT pour le heartbeat hebdomadaire : le panneau de la
 * semaine est `boards[semaineISO % boards.length]`. Aucun curseur committé,
 * aucun fichier d'état → aucun risque de boucle CI, et deux machines qui
 * calculent la même semaine choisissent le même panneau.
 *
 * Fonctions pures — testées dans src/tests/rotation.test.ts.
 */
import { estEnDiffusion } from './programmation.mjs';

/** Numéro de semaine ISO 8601 (1-53) — les semaines commencent le lundi. */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // dimanche = 7, pas 0
  d.setUTCDate(d.getUTCDate() + 4 - day); // jeudi de la même semaine ISO
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/**
 * Le panneau de la semaine, choisi parmi ceux en période de diffusion
 * (startDate/endDate, voir programmation.mjs). Sans période déclarée, tous le
 * sont : le choix est alors identique à l'ancienne règle.
 *
 * @returns {object | null} null si aucun panneau n'est en diffusion à `date`
 */
export function heartbeatBoard(boards, date) {
  if (!Array.isArray(boards)) return null;
  const diffusables = boards.filter((b) => estEnDiffusion(b, date));
  if (diffusables.length === 0) return null;
  return diffusables[isoWeek(date) % diffusables.length];
}

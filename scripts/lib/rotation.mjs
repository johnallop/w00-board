/**
 * Rotation SANS ÉTAT pour le heartbeat hebdomadaire : le panneau de la
 * semaine est `boards[semaineISO % boards.length]`. Aucun curseur committé,
 * aucun fichier d'état → aucun risque de boucle CI, et deux machines qui
 * calculent la même semaine choisissent le même panneau.
 *
 * Fonctions pures — testées dans src/tests/rotation.test.ts.
 */

/** Numéro de semaine ISO 8601 (1-53) — les semaines commencent le lundi. */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // dimanche = 7, pas 0
  d.setUTCDate(d.getUTCDate() + 4 - day); // jeudi de la même semaine ISO
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** @returns {object | null} le panneau de la semaine, ou null si le mur est vide */
export function heartbeatBoard(boards, date) {
  if (!Array.isArray(boards) || boards.length === 0) return null;
  return boards[isoWeek(date) % boards.length];
}

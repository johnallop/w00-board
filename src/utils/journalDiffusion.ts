/**
 * Journal des diffusions du kiosque /live : preuve locale de ce qu'un écran a
 * montré, et quand (le « proof-of-play » de l'affichage urbain).
 *
 * CONFIDENTIALITÉ. Le journal ne quitte jamais l'appareil : il vit dans le
 * localStorage du navigateur de l'écran, et n'en sort que par l'export JSON
 * qu'un opérateur déclenche lui-même. Il n'est tenu que sur demande
 * (/live?journal=1) : un visiteur ordinaire n'enregistre rien.
 *
 * Ce module est pur (aucun accès au DOM ni au stockage) — testé dans
 * src/tests/journalDiffusion.test.ts.
 */

export const CLE_JOURNAL = 'w00-journal-diffusion';

/** Format de l'export, versionné pour qu'un outil de lecture sache ce qu'il reçoit. */
export const FORMAT_EXPORT = 'w00-journal-diffusion/1';

/**
 * Plafond du journal. Un panneau toutes les 8 s pendant 10 h ≈ 4 500
 * entrées ; au-delà, les plus anciennes partent. Une entrée pèse ~200 octets :
 * 5 000 entrées ≈ 1 Mo, sous le quota usuel du localStorage (5 Mo, non garanti).
 */
export const MAX_ENTREES = 5000;

export interface EntreeJournal {
  /** Instant d'affichage, ISO 8601 UTC. */
  t: string;
  /** Identifiant du panneau affiché. */
  id: string;
  /** Empreinte SHA-256 complète du panneau (celle du sceau). */
  empreinte: string;
  /** Commit du build affiché (« dev » hors CI). */
  version: string;
  /** L'écran avait-il le réseau ? Hors ligne, il montrait sa copie locale. */
  enLigne: boolean;
}

function estEntree(e: unknown): e is EntreeJournal {
  if (typeof e !== 'object' || e === null) return false;
  const x = e as Record<string, unknown>;
  return (
    typeof x.t === 'string' &&
    typeof x.id === 'string' &&
    typeof x.empreinte === 'string' &&
    typeof x.version === 'string' &&
    typeof x.enLigne === 'boolean'
  );
}

/**
 * Relit le journal stocké. Une valeur absente, illisible ou d'un autre format
 * donne un journal vide plutôt qu'une exception : le kiosque doit continuer à
 * tourner. Les entrées mal formées sont écartées une à une.
 */
export function lireJournal(brut: string | null): EntreeJournal[] {
  if (!brut) return [];
  try {
    const valeur: unknown = JSON.parse(brut);
    return Array.isArray(valeur) ? valeur.filter(estEntree) : [];
  } catch {
    return [];
  }
}

/** Ajoute une entrée et retire les plus anciennes au-delà du plafond. */
export function ajouterEntree(
  journal: EntreeJournal[],
  entree: EntreeJournal,
  max = MAX_ENTREES,
): EntreeJournal[] {
  const suite = [...journal, entree];
  return suite.length > max ? suite.slice(suite.length - max) : suite;
}

/** Texte du fichier exporté. */
export function exporterJournal(
  journal: EntreeJournal[],
  contexte: { page: string; exporteLe: string },
): string {
  return JSON.stringify({ format: FORMAT_EXPORT, ...contexte, entrees: journal }, null, 2);
}

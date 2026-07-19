import type { BillboardItem } from '../types/config';

/**
 * Empreinte d'authenticité d'une affiche.
 *
 * Objectif : permettre à n'importe qui de vérifier qu'une affiche diffusée
 * (capture, impression, repost, miroir IPFS) correspond bien au contenu publié
 * dans `src/data/config.json`, sans blockchain, sans serveur, sans compte.
 *
 * Le calcul est volontairement trivial à reproduire à la main :
 *   1. sérialiser le panneau sous forme canonique (`canonicalizeBillboard`) ;
 *   2. encoder en UTF-8 ;
 *   3. SHA-256 ;
 *   4. lire les 64 premiers bits en hexadécimal.
 *
 * `crypto.subtle` est natif côté Node (build) ET côté navigateur (page
 * /verifier) : le même code produit le même résultat des deux côtés, ce qui
 * est précisément ce qui rend la vérification indépendante crédible.
 *
 * Ce module est pur et sans I/O — testé dans src/tests/posterHash.test.ts.
 */

/** Nombre de chiffres hexadécimaux affichés publiquement (64 bits). */
const FINGERPRINT_HEX_LENGTH = 16;

/**
 * Sérialise un panneau sous forme canonique — la chaîne exacte qui sera hachée.
 *
 * Deux panneaux éditorialement identiques DOIVENT produire la même chaîne ;
 * deux panneaux différents ne doivent JAMAIS pouvoir produire la même chaîne.
 *
 * @param board Le panneau tel qu'il figure dans config.json.
 * @returns La représentation canonique, stable et non ambiguë.
 */
export function canonicalizeBillboard(board: BillboardItem): string {
  // Périmètre : TOUS les champs publiés, pas seulement les champs éditoriaux.
  // L'empreinte certifie la version exacte affichée — si la page montre une
  // couleur, une date ou des tags, le sceau doit les couvrir. Conséquence
  // assumée : une retouche cosmétique produit un nouveau sceau.
  //
  // Encodage : tableau JSON à positions fixes. `JSON.stringify` échappe
  // lui-même guillemets et antislashs, donc un message contenant `","` ne peut
  // pas usurper le champ suivant — l'encodage est injectif, sans séparateur
  // maison ni préfixe de longueur.
  //
  // Optionnels : `null` marque l'absence, distinct de `[]` ou `""`.
  // L'ordre des `tags` est significatif (il fait partie de la version publiée).
  return JSON.stringify([
    board.id,
    board.message,
    board.author,
    board.tags ?? null,
    board.accentColor ?? null,
    board.date ?? null,
  ]);
}

/**
 * Calcule l'empreinte SHA-256 complète (64 chiffres hexadécimaux) d'un panneau.
 *
 * Asynchrone car `crypto.subtle.digest` l'est — appeler avec `await` depuis le
 * frontmatter Astro ou depuis un script client.
 */
export async function computeFingerprint(board: BillboardItem): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeBillboard(board));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToHex(new Uint8Array(digest));
}

/** Convertit un buffer d'octets en chaîne hexadécimale minuscule. */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Réduit une empreinte complète à sa forme publique lisible.
 *
 * 64 bits suffisent : l'empreinte sert à détecter une altération accidentelle
 * ou une citation erronée, pas à résister à une attaque par collision ciblée
 * — le contenu de référence reste public et vérifiable intégralement.
 *
 * @example formatFingerprint('a3f98c214e07bb5d…') → 'A3F9 8C21 4E07 BB5D'
 */
export function formatFingerprint(fullHex: string): string {
  return (fullHex.slice(0, FINGERPRINT_HEX_LENGTH).match(/.{1,4}/g) ?? [])
    .join(' ')
    .toUpperCase();
}

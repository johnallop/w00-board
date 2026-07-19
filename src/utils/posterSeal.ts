/**
 * Sceau visuel déterministe dérivé d'une empreinte d'affiche.
 *
 * Le sceau est un glyphe 8×8 à symétrie verticale, calculé depuis les 32 octets
 * du SHA-256 : 8 lignes × 4 demi-colonnes = 32 cellules, une par octet, sans
 * reste ni rembourrage. Un octet ≥ 128 allume sa cellule (densité attendue 50 %).
 *
 * Rôle : reconnaissance visuelle immédiate ("ce n'est pas le même sceau"),
 * PAS transport d'information. L'information vérifiable reste l'empreinte
 * hexadécimale affichée en texte à côté — le glyphe est donc décoratif et
 * marqué `aria-hidden` à l'usage (une info essentielle ne doit jamais dépendre
 * de la seule forme ou couleur).
 *
 * Fonction pure, sans I/O — testée dans src/tests/posterSeal.test.ts.
 */

/** Côté du glyphe en cellules. */
const GRID = 8;
/** Colonnes réellement calculées ; les autres sont le miroir de celles-ci. */
const HALF = GRID / 2;
/** Un octet allume sa cellule à partir de ce seuil. */
const ON_THRESHOLD = 128;

/**
 * Restreint une couleur à une forme sûre en contexte attribut SVG.
 *
 * `validateConfig` bloque déjà les injections CSS (`;`, `{}`, `url(`), mais un
 * attribut SVG a ses propres caractères dangereux (`"`, `<`, `&`). Plutôt que
 * d'échapper, on n'accepte qu'une liste de formes connues : hexadécimal ou
 * mot-clé CSS alphabétique. Tout le reste retombe sur `fallback`.
 */
export function sanitizeSvgColor(color: string, fallback = '#38bdf8'): string {
  const trimmed = color.trim();
  return /^#[0-9a-f]{3,8}$/i.test(trimmed) || /^[a-z]+$/i.test(trimmed) ? trimmed : fallback;
}

/**
 * Convertit une empreinte hexadécimale en grille booléenne 8×8 symétrique.
 *
 * @param fullHex Empreinte SHA-256 complète (64 chiffres hexadécimaux).
 * @returns 8 lignes de 8 booléens, miroir par rapport à l'axe vertical.
 * @throws Si l'empreinte n'a pas la forme attendue — un sceau faux serait pire
 *         qu'une absence de sceau.
 */
export function fingerprintToGrid(fullHex: string): boolean[][] {
  if (!/^[0-9a-f]{64}$/i.test(fullHex)) {
    throw new Error('fingerprintToGrid : empreinte SHA-256 hexadécimale de 64 caractères attendue');
  }

  const bytes = (fullHex.match(/.{2}/g) ?? []).map((pair) => parseInt(pair, 16));

  return Array.from({ length: GRID }, (_, row) => {
    const cells = Array.from({ length: HALF }, (_, col) => bytes[row * HALF + col] >= ON_THRESHOLD);
    // Miroir : la moitié droite reflète la gauche (colonne 7 = colonne 0, etc.)
    return [...cells, ...[...cells].reverse()];
  });
}

/**
 * Rend le sceau en SVG autonome, sans dépendance ni script.
 *
 * Le SVG est inséré via `set:html` : il ne contient aucune donnée utilisateur
 * hors la couleur, elle-même filtrée par `sanitizeSvgColor` — pas de texte, pas
 * d'URL, pas d'attribut dérivé d'une chaîne libre.
 *
 * @param fullHex Empreinte SHA-256 complète (64 chiffres hexadécimaux).
 * @param accentColor Couleur des cellules allumées.
 * @param size Côté du SVG en pixels.
 */
export function generateSealSvg(fullHex: string, accentColor: string, size = 96): string {
  const grid = fingerprintToGrid(fullHex);
  const color = sanitizeSvgColor(accentColor);
  const cell = size / GRID;

  const rects = grid
    .flatMap((cells, row) =>
      cells.map((on, col) =>
        on
          ? `<rect x="${(col * cell).toFixed(2)}" y="${(row * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" rx="${(cell * 0.18).toFixed(2)}" />`
          : ''
      )
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" fill="${color}" role="presentation" aria-hidden="true" focusable="false">${rects}</svg>`;
}

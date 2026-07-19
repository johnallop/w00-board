import { describe, it, expect } from 'vitest';
import { fingerprintToGrid, generateSealSvg, sanitizeSvgColor } from '../utils/posterSeal';

const HASH_PAIX = '8ed23b7e0d5d93942688e383625610a920bbf8f202f6e96866ed4907757f7341';
const HASH_JESUS = '41a22261be1b467a385ff6900463e43f4cbd90a2ec2ccb836a0274e85f95f464';
/** Tous les octets à 0x00 : aucune cellule allumée. */
const HASH_ZERO = '0'.repeat(64);
/** Tous les octets à 0xff : toutes les cellules allumées. */
const HASH_PLEIN = 'f'.repeat(64);

describe('fingerprintToGrid', () => {
  it('produit une grille 8×8', () => {
    const grid = fingerprintToGrid(HASH_PAIX);
    expect(grid).toHaveLength(8);
    grid.forEach((row) => expect(row).toHaveLength(8));
  });

  it('est symétrique par rapport à l’axe vertical', () => {
    fingerprintToGrid(HASH_PAIX).forEach((row) => {
      expect(row).toEqual([...row].reverse());
    });
  });

  it('consomme les 32 octets du digest, un par demi-cellule', () => {
    // 8 lignes × 4 demi-colonnes = 32 = taille exacte d'un SHA-256.
    const gauche = fingerprintToGrid(HASH_PAIX).flatMap((row) => row.slice(0, 4));
    expect(gauche).toHaveLength(32);
  });

  it('n’allume rien sous le seuil et tout au-dessus', () => {
    expect(fingerprintToGrid(HASH_ZERO).flat().some(Boolean)).toBe(false);
    expect(fingerprintToGrid(HASH_PLEIN).flat().every(Boolean)).toBe(true);
  });

  it('applique le seuil à 128 : 0x7f éteint, 0x80 allumé', () => {
    expect(fingerprintToGrid('7f'.repeat(32)).flat().some(Boolean)).toBe(false);
    expect(fingerprintToGrid('80'.repeat(32)).flat().every(Boolean)).toBe(true);
  });

  it('est déterministe et distingue deux empreintes', () => {
    expect(fingerprintToGrid(HASH_PAIX)).toEqual(fingerprintToGrid(HASH_PAIX));
    expect(fingerprintToGrid(HASH_PAIX)).not.toEqual(fingerprintToGrid(HASH_JESUS));
  });

  it('accepte l’hexadécimal majuscule', () => {
    expect(fingerprintToGrid(HASH_PAIX.toUpperCase())).toEqual(fingerprintToGrid(HASH_PAIX));
  });

  it.each([
    ['vide', ''],
    ['trop court', 'abc'],
    ['63 caractères', '0'.repeat(63)],
    ['65 caractères', '0'.repeat(65)],
    ['caractère non hexadécimal', 'z'.repeat(64)],
  ])('rejette une empreinte invalide (%s) plutôt que de dessiner un faux sceau', (_l, hex) => {
    expect(() => fingerprintToGrid(hex)).toThrow(/empreinte SHA-256/);
  });
});

describe('sanitizeSvgColor', () => {
  it.each([['#38bdf8'], ['#a78bfa'], ['#fff'], ['#38bdf880'], ['tomato'], ['currentColor']])(
    'conserve une couleur sûre (%s)',
    (color) => {
      expect(sanitizeSvgColor(color)).toBe(color);
    }
  );

  it.each([
    ['guillemet fermant un attribut', '#fff" onload="alert(1)'],
    ['balise', '<script>'],
    ['esperluette', '&#38;'],
    ['url()', 'url(https://exemple.tld/x.png)'],
    ['chaîne vide', ''],
    ['espaces multiples', 'red blue'],
  ])('remplace une valeur dangereuse (%s) par le fallback', (_l, color) => {
    expect(sanitizeSvgColor(color)).toBe('#38bdf8');
  });

  it('accepte un fallback personnalisé', () => {
    expect(sanitizeSvgColor('<bad>', '#000')).toBe('#000');
  });

  it('tolère les espaces autour d’une couleur valide', () => {
    expect(sanitizeSvgColor('  #a78bfa  ')).toBe('#a78bfa');
  });
});

describe('generateSealSvg', () => {
  it('produit un SVG bien formé et décoratif', () => {
    const svg = generateSealSvg(HASH_PAIX, '#a78bfa');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('role="presentation"');
  });

  it('dessine une cellule par bit allumé', () => {
    const allumees = fingerprintToGrid(HASH_PAIX).flat().filter(Boolean).length;
    const rects = generateSealSvg(HASH_PAIX, '#a78bfa').match(/<rect /g) ?? [];
    expect(rects).toHaveLength(allumees);
  });

  it('ne dessine aucun rect pour une empreinte entièrement à zéro', () => {
    expect(generateSealSvg(HASH_ZERO, '#a78bfa')).not.toContain('<rect');
  });

  it('respecte la taille demandée', () => {
    const svg = generateSealSvg(HASH_PAIX, '#a78bfa', 128);
    expect(svg).toContain('viewBox="0 0 128 128"');
    expect(svg).toContain('width="128"');
  });

  it('est déterministe (build reproductible)', () => {
    expect(generateSealSvg(HASH_PAIX, '#a78bfa')).toBe(generateSealSvg(HASH_PAIX, '#a78bfa'));
  });

  it('n’injecte jamais une couleur non filtrée dans l’attribut fill', () => {
    const svg = generateSealSvg(HASH_PAIX, '#fff" onload="alert(1)');
    expect(svg).not.toContain('onload');
    expect(svg).toContain('fill="#38bdf8"');
  });

  it('propage le rejet d’une empreinte invalide', () => {
    expect(() => generateSealSvg('nope', '#a78bfa')).toThrow(/empreinte SHA-256/);
  });
});

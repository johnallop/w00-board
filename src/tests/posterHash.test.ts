import { describe, it, expect } from 'vitest';
import {
  canonicalizeBillboard,
  computeFingerprint,
  bytesToHex,
  formatFingerprint,
} from '../utils/posterHash';
import type { BillboardItem } from '../types/config';

const board = (overrides: Partial<BillboardItem> = {}): BillboardItem => ({
  id: 'paix',
  message: 'LA PAIX SOIT AVEC VOUS',
  author: 'W00DDY',
  tags: ['Paix', 'Foi'],
  accentColor: '#a78bfa',
  date: '2026-06-23T16:24:58Z',
  ...overrides,
});

describe('canonicalizeBillboard', () => {
  it('sérialise les champs à positions fixes', () => {
    expect(canonicalizeBillboard({ id: 'test', message: 'A', author: 'B' })).toBe(
      '["test","A","B",null,null,null]'
    );
  });

  it('est déterministe : deux appels identiques produisent la même chaîne', () => {
    expect(canonicalizeBillboard(board())).toBe(canonicalizeBillboard(board()));
  });

  it("ne dépend pas de l'ordre des clés de l'objet source", () => {
    const reordered: BillboardItem = {
      date: '2026-06-23T16:24:58Z',
      author: 'W00DDY',
      accentColor: '#a78bfa',
      message: 'LA PAIX SOIT AVEC VOUS',
      tags: ['Paix', 'Foi'],
      id: 'paix',
    };
    expect(canonicalizeBillboard(reordered)).toBe(canonicalizeBillboard(board()));
  });

  it.each([
    ['id', { id: 'autre' }],
    ['message', { message: 'AUTRE MESSAGE' }],
    ['author', { author: 'Quelqu’un d’autre' }],
    ['tags', { tags: ['Paix'] }],
    ["ordre des tags", { tags: ['Foi', 'Paix'] }],
    ['accentColor', { accentColor: '#38bdf8' }],
    ['date', { date: '2026-07-01T00:00:00Z' }],
  ])('un changement de %s change la chaîne canonique', (_label, overrides) => {
    expect(canonicalizeBillboard(board(overrides))).not.toBe(canonicalizeBillboard(board()));
  });

  it('distingue absent, tableau vide et chaîne vide', () => {
    const absent = canonicalizeBillboard({ id: 'x', message: 'M', author: 'A' });
    const vide = canonicalizeBillboard({ id: 'x', message: 'M', author: 'A', tags: [] });
    const chaineVide = canonicalizeBillboard({
      id: 'x',
      message: 'M',
      author: 'A',
      accentColor: '',
    });
    expect(new Set([absent, vide, chaineVide]).size).toBe(3);
  });

  it("un message contenant le séparateur JSON ne peut pas usurper le champ suivant", () => {
    // Le piège d'une concaténation naïve « message|author » : ici le message
    // contient littéralement la ponctuation de séparation.
    const forge = canonicalizeBillboard({ id: 'test', message: 'A","B', author: '' });
    const cible = canonicalizeBillboard({ id: 'test', message: 'A', author: 'B' });
    expect(forge).not.toBe(cible);
  });
});

describe('computeFingerprint', () => {
  it('produit 64 chiffres hexadécimaux minuscules', async () => {
    expect(await computeFingerprint(board())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('correspond au SHA-256 de référence de la chaîne canonique', async () => {
    // Vecteur vérifiable à la main :
    //   printf '["test","A","B",null,null,null]' | sha256sum
    expect(await computeFingerprint({ id: 'test', message: 'A', author: 'B' })).toBe(
      'fbe23adf249f44bc0dce9ffc069bbf20a466a01dfe1de19dcbbdd576394a5101'
    );
  });

  it('est stable entre deux exécutions (build reproductible, CID IPFS stable)', async () => {
    expect(await computeFingerprint(board())).toBe(await computeFingerprint(board()));
  });

  it('change dès que le contenu publié change', async () => {
    expect(await computeFingerprint(board())).not.toBe(
      await computeFingerprint(board({ accentColor: '#38bdf8' }))
    );
  });

  it('gère les caractères non-ASCII sans perte (encodage UTF-8)', async () => {
    const accents = await computeFingerprint({ id: 'x', message: 'ÉTÉ ✝', author: 'W00DDY' });
    const sans = await computeFingerprint({ id: 'x', message: 'ETE +', author: 'W00DDY' });
    expect(accents).toMatch(/^[0-9a-f]{64}$/);
    expect(accents).not.toBe(sans);
  });
});

describe('bytesToHex', () => {
  it('préserve les zéros de tête de chaque octet', () => {
    expect(bytesToHex(new Uint8Array([0, 15, 16, 255]))).toBe('000f10ff');
  });

  it('retourne une chaîne vide pour un buffer vide', () => {
    expect(bytesToHex(new Uint8Array([]))).toBe('');
  });
});

describe('formatFingerprint', () => {
  it('affiche 64 bits en 4 groupes de 4, en majuscules', () => {
    expect(formatFingerprint('fbe23adf249f44bc0dce9ffc069bbf20a466a01dfe1de19dcbbdd576394a5101')).toBe(
      'FBE2 3ADF 249F 44BC'
    );
  });

  it('tronque bien à 16 chiffres quelle que soit la longueur fournie', () => {
    expect(formatFingerprint('0123456789abcdef0123456789abcdef')).toBe('0123 4567 89AB CDEF');
  });

  it('ne casse pas sur une empreinte plus courte que 16 chiffres', () => {
    expect(formatFingerprint('abc')).toBe('ABC');
  });

  it('retourne une chaîne vide pour une entrée vide', () => {
    expect(formatFingerprint('')).toBe('');
  });
});

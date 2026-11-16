import { describe, it, expect } from 'vitest';
import {
  ajouterEntree,
  exporterJournal,
  lireJournal,
  FORMAT_EXPORT,
  type EntreeJournal,
} from '../utils/journalDiffusion';

const entree = (n: number): EntreeJournal => ({
  t: `2026-11-16T10:00:${String(n % 60).padStart(2, '0')}.000Z`,
  id: `p${n}`,
  empreinte: 'a'.repeat(64),
  version: '0ea2b2b',
  enLigne: true,
});

describe('lireJournal', () => {
  it('relit ce que le kiosque a écrit', () => {
    const journal = [entree(1), entree(2)];
    expect(lireJournal(JSON.stringify(journal))).toEqual(journal);
  });

  // Le kiosque doit continuer à tourner quoi que contienne le stockage.
  it.each([
    ['absent', null],
    ['vide', ''],
    ['JSON cassé', '[{"t":'],
    ['autre forme', '{"t":"x"}'],
  ])('rend un journal vide : %s', (_, brut) => {
    expect(lireJournal(brut)).toEqual([]);
  });

  it('écarte une à une les entrées mal formées', () => {
    const brut = JSON.stringify([
      entree(1),
      { ...entree(2), enLigne: 'oui' },
      { id: 'x' },
      entree(3),
    ]);
    expect(lireJournal(brut).map((e) => e.id)).toEqual(['p1', 'p3']);
  });
});

describe('ajouterEntree', () => {
  it('ajoute à la fin sans modifier le journal reçu', () => {
    const avant = [entree(1)];
    const apres = ajouterEntree(avant, entree(2));
    expect(apres.map((e) => e.id)).toEqual(['p1', 'p2']);
    expect(avant).toHaveLength(1);
  });

  it('retire les plus anciennes au-delà du plafond', () => {
    let journal: EntreeJournal[] = [];
    for (let n = 1; n <= 5; n++) journal = ajouterEntree(journal, entree(n), 3);
    expect(journal.map((e) => e.id)).toEqual(['p3', 'p4', 'p5']);
  });
});

describe('exporterJournal', () => {
  it('produit un JSON versionné, relisible par lireJournal', () => {
    const journal = [entree(1)];
    const texte = exporterJournal(journal, {
      page: 'https://board.wooddyviat.com/live/?journal=1',
      exporteLe: '2026-11-16T12:00:00Z',
    });
    const objet = JSON.parse(texte);
    expect(objet.format).toBe(FORMAT_EXPORT);
    expect(objet.exporteLe).toBe('2026-11-16T12:00:00Z');
    expect(lireJournal(JSON.stringify(objet.entrees))).toEqual(journal);
  });
});

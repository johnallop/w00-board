import { describe, it, expect } from 'vitest';
import { diffBillboards } from '../../scripts/lib/diff-billboards.mjs';

const board = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  message: `Message de ${id}`,
  author: 'W00DDY',
  tags: ['Foi'],
  accentColor: '#38bdf8',
  date: '2026-06-23T13:38:09Z',
  ...overrides,
});

const config = (...billboards: any[]) => ({ billboards });

const EMPTY = { added: [], changed: [] };

const runDiff = (prev: any, curr: any) => diffBillboards(prev, curr) as {
  added: { id: string }[];
  changed: { id: string }[];
};

describe('diffBillboards', () => {
  it('détecte un panneau ajouté', () => {
    const prev = config(board('jesus-aime'));
    const curr = config(board('jesus-aime'), board('paix'));
    const diff = runDiff(prev, curr);
    expect(diff.added.map((b) => b.id)).toEqual(['paix']);
    expect(diff.changed).toEqual([]);
  });

  it('détecte un message modifié', () => {
    const prev = config(board('paix'));
    const curr = config(board('paix', { message: 'NOUVEAU MESSAGE' }));
    const diff = runDiff(prev, curr);
    expect(diff.added).toEqual([]);
    expect(diff.changed.map((b) => b.id)).toEqual(['paix']);
  });

  it('détecte un auteur modifié', () => {
    const prev = config(board('paix'));
    const curr = config(board('paix', { author: 'Quelqu’un d’autre' }));
    expect(runDiff(prev, curr).changed).toHaveLength(1);
  });

  it('ignore les changements de tags, couleur ou date seuls (cosmétique)', () => {
    const prev = config(board('paix'));
    const curr = config(
      board('paix', { tags: ['Paix', 'Espoir'], accentColor: '#a78bfa', date: '2026-07-01T00:00:00Z' })
    );
    expect(runDiff(prev, curr)).toEqual(EMPTY);
  });

  it('ne diffuse rien sur une suppression', () => {
    const prev = config(board('jesus-aime'), board('paix'));
    const curr = config(board('jesus-aime'));
    expect(runDiff(prev, curr)).toEqual(EMPTY);
  });

  it('ne diffuse rien sur un réordonnancement (tue le bug « position 0 »)', () => {
    const prev = config(board('jesus-aime'), board('paix'));
    const curr = config(board('paix'), board('jesus-aime'));
    expect(runDiff(prev, curr)).toEqual(EMPTY);
  });

  it('combine ajout et modification dans le même push', () => {
    const prev = config(board('jesus-aime'), board('paix'));
    const curr = config(board('jesus-aime', { message: 'RÉÉCRIT' }), board('paix'), board('espoir'));
    const diff = runDiff(prev, curr);
    expect(diff.added.map((b) => b.id)).toEqual(['espoir']);
    expect(diff.changed.map((b) => b.id)).toEqual(['jesus-aime']);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['chaîne', 'pas un objet'],
    ['billboards non-tableau', { billboards: 'oops' }],
    ['objet vide', {}],
  ])('prev absent ou malformé (%s) → diff vide, jamais de rediffusion massive', (_label, prev) => {
    const curr = config(board('jesus-aime'), board('paix'));
    expect(runDiff(prev, curr)).toEqual(EMPTY);
  });

  it('curr malformé → diff vide', () => {
    expect(runDiff(config(board('paix')), null)).toEqual(EMPTY);
    expect(runDiff(config(board('paix')), { billboards: 42 })).toEqual(EMPTY);
  });

  it('prev valide mais vide → tous les panneaux courants sont « ajoutés »', () => {
    const diff = runDiff(config(), config(board('jesus-aime')));
    expect(diff.added.map((b) => b.id)).toEqual(['jesus-aime']);
  });

  it('ignore les entrées sans id (malformées) dans les deux configs', () => {
    const prev = config(board('paix'), { message: 'sans id' });
    const curr = config(board('paix'), { message: 'toujours sans id' });
    expect(runDiff(prev, curr)).toEqual(EMPTY);
  });
});

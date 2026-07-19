import { describe, it, expect } from 'vitest';
import { isoWeek, heartbeatBoard } from '../../scripts/lib/rotation.mjs';


describe('isoWeek', () => {
  it.each([
    // 2026 commence un jeudi → le 1er janvier appartient à la semaine 1
    ['2026-01-01T12:00:00Z', 1],
    // Lundi 5 janvier 2026 ouvre la semaine 2
    ['2026-01-05T00:00:00Z', 2],
    // Année à 53 semaines (1er janvier = jeudi) : le 31 décembre reste en semaine 53
    ['2026-12-31T23:59:59Z', 53],
    // 1er janvier 2027 (vendredi) appartient encore à la semaine 53 de 2026
    ['2027-01-01T00:00:00Z', 53],
    // Dimanche appartient à la semaine ouverte le lundi précédent
    ['2026-01-11T00:00:00Z', 2],
  ])('%s → semaine %i', (iso, expected) => {
    expect(isoWeek(new Date(iso))).toBe(expected);
  });
});

describe('heartbeatBoard', () => {
  const boards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('choisit le panneau semaineISO % longueur', () => {
    // 2026-01-05 = semaine 2 → 2 % 3 = index 2
    expect(heartbeatBoard(boards, new Date('2026-01-05T09:17:00Z'))).toEqual({ id: 'c' });
  });

  it('est stable toute la semaine (lundi et dimanche → même panneau)', () => {
    const monday = heartbeatBoard(boards, new Date('2026-01-05T00:00:00Z'));
    const sunday = heartbeatBoard(boards, new Date('2026-01-11T23:59:59Z'));
    expect(monday).toEqual(sunday);
  });

  it('couvre tous les panneaux sur des semaines consécutives', () => {
    // Semaines 2, 3, 4 → indices 2, 0, 1 : rotation complète
    const picked = ['2026-01-05', '2026-01-12', '2026-01-19'].map(
      (d) => (heartbeatBoard(boards, new Date(`${d}T09:17:00Z`)) as { id: string }).id
    );
    expect(new Set(picked).size).toBe(boards.length);
  });

  it('rend null pour un mur vide ou invalide', () => {
    expect(heartbeatBoard([], new Date('2026-01-05T00:00:00Z'))).toBeNull();
    expect(heartbeatBoard(undefined, new Date('2026-01-05T00:00:00Z'))).toBeNull();
  });
});

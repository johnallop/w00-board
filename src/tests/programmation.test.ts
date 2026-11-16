import { describe, it, expect } from 'vitest';
import {
  debutMs,
  finMs,
  etatDeDiffusion,
  estEnDiffusion,
  libellePeriode,
} from '../../scripts/lib/programmation.mjs';

const t = (iso: string) => new Date(iso);

describe('bornes de diffusion', () => {
  it('lit un jour seul en UTC, et sa fin couvre toute la journée', () => {
    expect(debutMs('2026-12-01')).toBe(Date.parse('2026-12-01T00:00:00Z'));
    expect(finMs('2026-12-15')).toBe(Date.parse('2026-12-16T00:00:00Z'));
  });

  it('prend une date-heure telle quelle, fuseau compris', () => {
    expect(finMs('2026-12-15T18:00:00+01:00')).toBe(Date.parse('2026-12-15T17:00:00Z'));
  });

  // Une heure SANS fuseau dépendrait de la machine qui lit : refusée, comme `date`.
  it.each([['2026-12-15T18:00'], ['15/12/2026'], ['2026-13-40'], [''], [42], [null], [undefined]])(
    'rend null pour %s',
    (valeur) => {
      expect(debutMs(valeur)).toBeNull();
      expect(finMs(valeur)).toBeNull();
    },
  );
});

describe('etatDeDiffusion', () => {
  const campagne = { startDate: '2026-12-01', endDate: '2026-12-15' };

  it.each([
    ['2026-11-30T23:59:59Z', 'a-venir'],
    ['2026-12-01T00:00:00Z', 'en-cours'], // début inclus
    ['2026-12-15T23:59:59Z', 'en-cours'], // le dernier jour entier est diffusé
    ['2026-12-16T00:00:00Z', 'terminee'],
  ])('%s → %s', (instant, attendu) => {
    expect(etatDeDiffusion(campagne, t(instant))).toBe(attendu);
  });

  it('diffuse toujours un panneau sans période (comportement d’avant)', () => {
    expect(estEnDiffusion({}, t('2000-01-01T00:00:00Z'))).toBe(true);
    expect(estEnDiffusion({ id: 'paix' }, t('2099-01-01T00:00:00Z'))).toBe(true);
  });

  it('accepte une seule borne', () => {
    expect(estEnDiffusion({ startDate: '2026-12-01' }, t('2030-01-01T00:00:00Z'))).toBe(true);
    expect(estEnDiffusion({ endDate: '2026-12-15' }, t('2026-12-16T00:00:00Z'))).toBe(false);
  });

  it('arrête une fin à l’heure précise quand une heure est donnée', () => {
    const p = { endDate: '2026-12-15T18:00:00Z' };
    expect(estEnDiffusion(p, t('2026-12-15T17:59:59Z'))).toBe(true);
    expect(estEnDiffusion(p, t('2026-12-15T18:00:00Z'))).toBe(false);
  });
});

describe('libellePeriode', () => {
  it.each([
    [
      { startDate: '2026-12-01', endDate: '2026-12-15' },
      'Diffusé du 1 décembre 2026 au 15 décembre 2026',
    ],
    [{ startDate: '2026-12-01' }, 'Diffusé à partir du 1 décembre 2026'],
    [{ endDate: '2026-12-15T18:00:00Z' }, 'Diffusé jusqu’au 15 décembre 2026 à 18:00 UTC'],
  ])('%o → %s', (panneau, attendu) => {
    expect(libellePeriode(panneau)).toBe(attendu);
  });

  it('ne dit rien sans période', () => {
    expect(libellePeriode({})).toBeNull();
  });
});

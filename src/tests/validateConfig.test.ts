import { describe, it, expect } from 'vitest';
import { validateConfig } from '../utils/validateConfig';

const validConfig = {
  billboards: [
    {
      id: 'test-1',
      message: 'Bienvenue sur le Panneau',
      author: "L'Administrateur",
      tags: ['Test', 'Demo'],
      accentColor: '#38bdf8',
    },
  ],
  theme: {
    backgroundColor: '#0f172a',
    textColor: '#f8fafc',
    accentColor: '#38bdf8',
    fontSize: '2.5rem',
    fontFamily: 'Inter',
  },
  layout: {
    horizontalAlignment: 'center',
    verticalAlignment: 'center',
  },
};

describe('validateConfig', () => {
  it('accepte une config valide', () => {
    expect(() => validateConfig(validConfig)).not.toThrow();
  });

  it('accepte plusieurs panneaux', () => {
    expect(() =>
      validateConfig({
        ...validConfig,
        billboards: [
          ...validConfig.billboards,
          { id: 'test-2', message: 'Second message', author: 'Auteur 2' },
        ],
      })
    ).not.toThrow();
  });

  it('rejette null', () => {
    expect(() => validateConfig(null)).toThrow('doit être un objet JSON valide');
  });

  it('rejette billboards manquant', () => {
    expect(() => validateConfig({ ...validConfig, billboards: undefined })).toThrow('"billboards"');
  });

  it('rejette billboards vide', () => {
    expect(() => validateConfig({ ...validConfig, billboards: [] })).toThrow('"billboards"');
  });

  it('rejette un message vide dans un panneau', () => {
    expect(() =>
      validateConfig({ ...validConfig, billboards: [{ ...validConfig.billboards[0], message: '  ' }] })
    ).toThrow('"billboards[0].message"');
  });

  it('rejette un auteur manquant dans un panneau', () => {
    expect(() =>
      validateConfig({ ...validConfig, billboards: [{ ...validConfig.billboards[0], author: '' }] })
    ).toThrow('"billboards[0].author"');
  });

  it('rejette un id manquant dans un panneau', () => {
    expect(() =>
      validateConfig({ ...validConfig, billboards: [{ ...validConfig.billboards[0], id: '' }] })
    ).toThrow('"billboards[0].id"');
  });

  it('rejette tags invalide (pas un tableau)', () => {
    expect(() =>
      validateConfig({ ...validConfig, billboards: [{ ...validConfig.billboards[0], tags: 'jesus' }] })
    ).toThrow('"billboards[0].tags"');
  });

  it('rejette un theme manquant', () => {
    expect(() => validateConfig({ ...validConfig, theme: null })).toThrow('"theme"');
  });

  it('rejette une clé de theme vide', () => {
    expect(() =>
      validateConfig({ ...validConfig, theme: { ...validConfig.theme, accentColor: '' } })
    ).toThrow('"theme.accentColor"');
  });

  it('rejette un horizontalAlignment invalide', () => {
    expect(() =>
      validateConfig({ ...validConfig, layout: { ...validConfig.layout, horizontalAlignment: 'middle' } })
    ).toThrow('"layout.horizontalAlignment"');
  });

  it('rejette un verticalAlignment invalide', () => {
    expect(() =>
      validateConfig({ ...validConfig, layout: { ...validConfig.layout, verticalAlignment: 'middle' } })
    ).toThrow('"layout.verticalAlignment"');
  });
});

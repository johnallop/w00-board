import { describe, it, expect } from 'vitest';
import { validateConfig } from '../utils/validateConfig';

const validConfig = {
  message: 'Bienvenue sur le Panneau',
  author: "L'Administrateur",
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

  it('rejette null', () => {
    expect(() => validateConfig(null)).toThrow('doit être un objet JSON valide');
  });

  it('rejette un message vide', () => {
    expect(() => validateConfig({ ...validConfig, message: '  ' })).toThrow('"message"');
  });

  it('rejette un auteur manquant', () => {
    expect(() => validateConfig({ ...validConfig, author: '' })).toThrow('"author"');
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

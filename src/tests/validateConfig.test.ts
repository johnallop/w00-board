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

  it('accepte une date ISO complète avec fuseau', () => {
    expect(() =>
      validateConfig({ ...validConfig, billboards: [{ ...validConfig.billboards[0], date: '2026-06-23T13:38:09Z' }] })
    ).not.toThrow();
  });

  it('accepte une date ISO jour seul', () => {
    expect(() =>
      validateConfig({ ...validConfig, billboards: [{ ...validConfig.billboards[0], date: '2026-06-23' }] })
    ).not.toThrow();
  });

  it('accepte un panneau sans date (champ optionnel)', () => {
    expect(() =>
      validateConfig({ ...validConfig, billboards: [{ id: 'x', message: 'M', author: 'A' }] })
    ).not.toThrow();
  });

  it('rejette une date non ISO', () => {
    expect(() =>
      validateConfig({ ...validConfig, billboards: [{ ...validConfig.billboards[0], date: '23/06/2026' }] })
    ).toThrow('"billboards[0].date"');
  });

  it('rejette une heure sans fuseau (non déterministe au build)', () => {
    expect(() =>
      validateConfig({ ...validConfig, billboards: [{ ...validConfig.billboards[0], date: '2026-06-23T13:38:09' }] })
    ).toThrow('"billboards[0].date"');
  });

  it('rejette une date impossible', () => {
    expect(() =>
      validateConfig({ ...validConfig, billboards: [{ ...validConfig.billboards[0], date: '2026-13-45' }] })
    ).toThrow('"billboards[0].date"');
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

  it('rejette un id contenant des caractères non URL-safe', () => {
    expect(() =>
      validateConfig({ ...validConfig, billboards: [{ ...validConfig.billboards[0], id: 'test 1/../../root' }] })
    ).toThrow('"billboards[0].id"');
    expect(() =>
      validateConfig({ ...validConfig, billboards: [{ ...validConfig.billboards[0], id: 'test?id=4' }] })
    ).toThrow('"billboards[0].id"');
  });

  it('rejette une couleur contenant des injections CSS', () => {
    expect(() =>
      validateConfig({
        ...validConfig,
        billboards: [{ ...validConfig.billboards[0], accentColor: 'red; background: url(javascript:alert(1))' }],
      })
    ).toThrow('"billboards[0].accentColor"');
    
    expect(() =>
      validateConfig({
        ...validConfig,
        theme: { ...validConfig.theme, backgroundColor: '#000; body { display: none }' },
      })
    ).toThrow('"theme.backgroundColor"');
  });

  it('rejette les couleurs à contraste insuffisant (< 4.5:1)', () => {
    // Fond sombre #0f172a, texte vert très sombre #052e16 (contraste ~1.2:1)
    expect(() =>
      validateConfig({
        ...validConfig,
        theme: { ...validConfig.theme, textColor: '#052e16' },
      })
    ).toThrow('"theme.textColor"');

    // Fond sombre #0f172a, accent du panneau bleu très sombre #172554
    expect(() =>
      validateConfig({
        ...validConfig,
        billboards: [{ ...validConfig.billboards[0], accentColor: '#172554' }],
      })
    ).toThrow('"billboards[0].accentColor"');
  });

  /*
   * Ces contrôles visent une seule faute, répétée sous quatre formes : rendre la
   * porte plus permissive quand elle comprend moins. Le premier est celui qui
   * comptait — il passait au vert avant correction, avec un ratio de 5.00:1
   * affiché sans qu'aucune couleur n'ait été mesurée.
   */
  describe('couleurs non mesurables', () => {
    it("refuse un nom CSS au lieu de le laisser contourner la mesure", () => {
      // Avant : getContrastRatio renvoyait 5.0 dès qu'une couleur ne commençait
      // pas par « # ». « white » sur « white » passait donc la barrière WCAG.
      expect(() =>
        validateConfig({
          ...validConfig,
          theme: { ...validConfig.theme, backgroundColor: 'white', textColor: 'white' },
        })
      ).toThrow('"theme.backgroundColor"');
    });

    it('refuse une fonction rgb() — non mesurable elle aussi', () => {
      expect(() =>
        validateConfig({
          ...validConfig,
          theme: { ...validConfig.theme, accentColor: 'rgb(56, 189, 248)' },
        })
      ).toThrow('"theme.accentColor"');
    });

    it('refuse une couleur de panneau non hexadécimale', () => {
      expect(() =>
        validateConfig({
          ...validConfig,
          billboards: [{ ...validConfig.billboards[0], accentColor: 'goldenrod' }],
        })
      ).toThrow('"billboards[0].accentColor"');
    });

    it('accepte les formes hexadécimales courtes et alpha opaques', () => {
      expect(() =>
        validateConfig({ ...validConfig, theme: { ...validConfig.theme, textColor: '#fff' } })
      ).not.toThrow();
      expect(() =>
        validateConfig({ ...validConfig, theme: { ...validConfig.theme, textColor: '#f8fafcff' } })
      ).not.toThrow();
    });

    it('refuse une couleur semi-transparente : le contraste y est indécidable', () => {
      expect(() =>
        validateConfig({ ...validConfig, theme: { ...validConfig.theme, textColor: '#f8fafc80' } })
      ).toThrow('semi-transparente');
    });

    it('refuse une longueur hexadécimale inexistante', () => {
      // 5 et 7 chiffres ne correspondent à aucune notation CSS : l'ancien
      // analyseur les rejetait aussi, mais retombait alors sur une luminance
      // fabriquée de 0.5 au lieu de refuser.
      for (const invalide of ['#12345', '#1234567']) {
        expect(() =>
          validateConfig({ ...validConfig, theme: { ...validConfig.theme, textColor: invalide } })
        ).toThrow('"theme.textColor"');
      }
    });

    it("mesure l'accent d'un panneau même si le fond du thème est illisible", () => {
      // Le fond invalide désactivait auparavant le contrôle de contraste de tous
      // les panneaux. Il doit désormais échouer, pas se taire.
      expect(() =>
        validateConfig({
          ...validConfig,
          theme: { ...validConfig.theme, backgroundColor: 'transparent' },
          billboards: [{ ...validConfig.billboards[0], accentColor: '#172554' }],
        })
      ).toThrow();
    });
  });

  describe('typographie du thème', () => {
    it("refuse une fontFamily qui injecte une déclaration CSS", () => {
      // Insérée telle quelle dans un attribut style : « ; » suffit à ajouter une
      // déclaration, et url() à faire émettre une requête par chaque visiteur.
      expect(() =>
        validateConfig({
          ...validConfig,
          theme: {
            ...validConfig.theme,
            fontFamily: 'Inter; background-image: url(https://exemple.invalid/p.png)',
          },
        })
      ).toThrow('"theme.fontFamily"');
    });

    it('accepte une pile de polices réaliste', () => {
      expect(() =>
        validateConfig({
          ...validConfig,
          theme: { ...validConfig.theme, fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif' },
        })
      ).not.toThrow();
    });

    it('refuse une fontSize que l’image OG ne sait pas convertir', () => {
      // « abc » produisait parseFloat → NaN → fontSize: "NaNpx" transmis à
      // satori ; « 4vw » était accepté ici puis remplacé par 48 px sans un mot.
      for (const invalide of ['abc', '4vw', '2.5', '48']) {
        expect(() =>
          validateConfig({ ...validConfig, theme: { ...validConfig.theme, fontSize: invalide } })
        ).toThrow('"theme.fontSize"');
      }
    });

    it('accepte rem et px', () => {
      for (const valide of ['2.5rem', '48px']) {
        expect(() =>
          validateConfig({ ...validConfig, theme: { ...validConfig.theme, fontSize: valide } })
        ).not.toThrow();
      }
    });
  });

  it('rejette des panneaux avec des IDs dupliqués', () => {
    expect(() =>
      validateConfig({
        ...validConfig,
        billboards: [
          { ...validConfig.billboards[0], id: 'same-id' },
          { ...validConfig.billboards[0], id: 'same-id', message: 'Autre message' },
        ],
      })
    ).toThrow('ID dupliqué "same-id"');
  });
});

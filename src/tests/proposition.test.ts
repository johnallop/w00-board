import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import config from '../data/config.json';
import { validateConfig } from '../utils/validateConfig';
import {
  LIMITES,
  LABEL_PROPOSITION,
  slugifier,
  normaliserProposition,
  corpsIssue,
  urlIssue,
  extraireProposition,
  ajouterPanneau,
  serialiserConfig,
} from '../../scripts/lib/proposition.mjs';

const valide = {
  message: 'Le ciel est à tout le monde',
  author: 'Anonyme',
  tags: ['Ciel'],
  accentColor: '#38BDF8',
};

describe('slugifier', () => {
  it('retire accents, ponctuation et casse', () => {
    expect(slugifier("Jésus t'aime !")).toBe('jesus-t-aime');
  });

  it('borne la longueur sans laisser de tiret final', () => {
    const s = slugifier('a '.repeat(100));
    expect(s.length).toBeLessThanOrEqual(LIMITES.id);
    expect(s.endsWith('-')).toBe(false);
  });

  it('retombe sur « panneau » quand rien ne survit (emoji, CJK, arabe)', () => {
    expect(slugifier('🔥🔥')).toBe('panneau');
    expect(slugifier('和平')).toBe('panneau');
    expect(slugifier('سلام')).toBe('panneau');
  });
});

describe('normaliserProposition', () => {
  it('nettoie les espaces, dérive l’id et met la couleur en minuscules', () => {
    const p = normaliserProposition({ ...valide, message: '  Le  ciel   est à tout le monde ' });
    expect(p).toEqual({
      id: 'le-ciel-est-a-tout-le-monde',
      message: 'Le ciel est à tout le monde',
      author: 'Anonyme',
      tags: ['Ciel'],
      accentColor: '#38bdf8',
    });
  });

  it('retire « # » et espaces des tags, et dédoublonne', () => {
    const p = normaliserProposition({ ...valide, tags: ['#Paix', 'Paix', 'Bonne Nouvelle', ' '] });
    expect(p.tags).toEqual(['Paix', 'BonneNouvelle']);
  });

  it('omet tags et couleur vides plutôt que d’écrire des clés creuses', () => {
    const p = normaliserProposition({ message: 'X', author: 'Y', tags: [], accentColor: '' });
    expect(p).not.toHaveProperty('tags');
    expect(p).not.toHaveProperty('accentColor');
  });

  it('compte un emoji pour un caractère', () => {
    const message = '🔥'.repeat(LIMITES.message);
    expect(() => normaliserProposition({ ...valide, message })).not.toThrow();
    expect(() => normaliserProposition({ ...valide, message: `${message}🔥` })).toThrow(
      /280 au plus/,
    );
  });

  it.each([
    [{ ...valide, message: '   ' }, /"message"/],
    [{ ...valide, author: undefined }, /"author"/],
    [{ ...valide, author: 'x'.repeat(LIMITES.author + 1) }, /"author"/],
    [{ ...valide, id: '../etc' }, /"id"/],
    [{ ...valide, tags: 'Paix' }, /"tags"/],
    [{ ...valide, tags: ['a', 'b', 'c', 'd', 'e', 'f'] }, /6 tags/],
    [{ ...valide, tags: ['x'.repeat(LIMITES.tag + 1)] }, /dépasse/],
    [{ ...valide, accentColor: 'red' }, /#rrggbb/],
    [{ ...valide, accentColor: '#fff;background:url(x)' }, /#rrggbb/],
    [null, /objet JSON/],
    [['message'], /objet JSON/],
  ])('refuse %j en nommant le champ', (brut, motif) => {
    expect(() => normaliserProposition(brut)).toThrow(motif);
  });
});

describe('aller-retour issue → proposition', () => {
  it('relit exactement ce que la page a écrit', () => {
    const p = normaliserProposition(valide);
    expect(extraireProposition(corpsIssue(p))).toEqual(p);
  });

  it('supporte les fins de ligne CRLF du formulaire GitHub', () => {
    const p = normaliserProposition(valide);
    expect(extraireProposition(corpsIssue(p).replace(/\n/g, '\r\n'))).toEqual(p);
  });

  it('ne lit que le PREMIER bloc json', () => {
    const p = normaliserProposition(valide);
    const pirate = `${corpsIssue(p)}\n\n\`\`\`json\n{"message":"autre","author":"pirate"}\n\`\`\`\n`;
    expect(extraireProposition(pirate).author).toBe('Anonyme');
  });

  it.each([
    [undefined, /corps est vide/],
    ['pas de bloc', /aucun bloc/],
    ['```json\n{"message":"x"', /pas refermé/],
    ['```json\n{oups}\n```', /illisible/],
  ])('explique un corps inexploitable (%j)', (corps, motif) => {
    expect(() => extraireProposition(corps)).toThrow(motif);
  });

  it('construit une URL d’issue préremplie avec le label de proposition', () => {
    const url = new URL(urlIssue('https://github.com/o/r/', normaliserProposition(valide)));
    expect(url.origin + url.pathname).toBe('https://github.com/o/r/issues/new');
    expect(url.searchParams.get('labels')).toBe(LABEL_PROPOSITION);
    expect(url.searchParams.get('body')).toContain('"author": "Anonyme"');
    // Les navigateurs et GitHub tronquent au-delà de ~8 Ko : la pire
    // proposition admise doit rester largement en dessous.
    const pire = normaliserProposition({
      message: 'é'.repeat(LIMITES.message),
      author: 'é'.repeat(LIMITES.author),
      tags: Array.from({ length: LIMITES.tags }, (_, i) => `${i}${'é'.repeat(LIMITES.tag - 1)}`),
      accentColor: '#ffffff',
    });
    expect(urlIssue('https://github.com/o/r', pire).length).toBeLessThan(8000);
  });
});

describe('ajouterPanneau', () => {
  it('ajoute EN FIN de mur, sans muter la config, et passe validateConfig', () => {
    const avant = JSON.stringify(config);
    const suivante = ajouterPanneau(
      config,
      normaliserProposition(valide),
      '2026-11-14T12:00:00Z',
    ) as typeof config;
    expect(JSON.stringify(config)).toBe(avant);
    expect(suivante.billboards[0]).toEqual(config.billboards[0]);
    expect(suivante.billboards.at(-1)).toMatchObject({
      id: 'le-ciel-est-a-tout-le-monde',
      date: '2026-11-14T12:00:00Z',
    });
    expect(() => validateConfig(suivante)).not.toThrow();
  });

  it('refuse un id déjà pris', () => {
    const p = normaliserProposition({ ...valide, id: config.billboards[0].id });
    expect(() => ajouterPanneau(config, p, '2026-11-14T12:00:00Z')).toThrow(/existe déjà/);
  });

  it('laisse validateConfig refuser une couleur sans contraste', () => {
    const p = normaliserProposition({ ...valide, accentColor: '#111827' });
    const suivante = ajouterPanneau(config, p, '2026-11-14T12:00:00Z');
    expect(() => validateConfig(suivante)).toThrow(/contraste insuffisant/);
  });
});

describe('serialiserConfig', () => {
  it('reproduit octet pour octet le config.json versionné', () => {
    /*
     * C'est la garantie qui rend la PR de proposition relisible : si le
     * sérialiseur s'écartait du format du fichier, chaque proposition
     * réécrirait tout config.json et l'ajout se perdrait dans le diff.
     */
    const chemin = fileURLToPath(new URL('../data/config.json', import.meta.url));
    const fichier = readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n');
    expect(`${serialiserConfig(JSON.parse(fichier))}\n`).toBe(fichier);
  });

  it('ne produit qu’un diff d’ajout pour une proposition', () => {
    const avant = serialiserConfig(config).split('\n');
    const apres = serialiserConfig(
      ajouterPanneau(config, normaliserProposition(valide), '2026-11-14T12:00:00Z'),
    ).split('\n');
    // Tout est identique jusqu'à la fermeture du dernier panneau, qui gagne une
    // virgule ; après le bloc inséré, la fin du fichier est inchangée.
    let p = 0;
    while (avant[p] === apres[p]) p++;
    expect(avant[p]).toBe('    }');
    expect(apres[p]).toBe('    },');
    const fin = avant.slice(p + 1);
    expect(apres.slice(apres.length - fin.length)).toEqual(fin);
  });
});

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import type { APIContext } from 'astro';
import { GET } from '../pages/feed.json';
import config from '../data/config.json';
import { canonicalizeBillboard } from '../utils/posterHash';
import { nonConformingKeys } from './helpers/feedConformance';

/*
 * Pendant JSON du test sur feed.xml, avec un angle mort plus sournois.
 *
 * Un XML mal formé casse bruyamment : le lecteur rejette le document entier.
 * Une clé JSON non conforme ne casse rien — un lecteur strict l'ignore en
 * silence. Une extension nommée `w00_board` au lieu de `_w00_board` sortirait
 * donc d'un build vert, s'afficherait parfaitement dans nos propres pages, et
 * disparaîtrait sans un mot chez les consommateurs. Aucun test ne regardait la
 * sortie JSON produite.
 *
 * Limite structurelle, à l'inverse du test XML : « ce préfixe est-il déclaré »
 * se vérifie à l'intérieur du document, « cette clé est-elle dans la spec » exige
 * une liste blanche transcrite à la main, que rien ne resynchronise avec
 * jsonfeed.org. Ce test vieillira si la spec évolue.
 *
 * Ce fichier interroge la route en mémoire ; distArtefacts.test.ts rejoue le
 * même contrôleur sur dist/feed.json, après compression.
 *
 * Spec : https://www.jsonfeed.org/version/1.1/
 */

const SITE = 'https://w00-board.pages.dev/';

async function buildFeed(): Promise<string> {
  // `GET` ne lit que `context.site` : ce seul champ suffit, et appeler la route
  // isole ce fichier du build — un dist/ périmé ne peut pas le verdir à tort.
  const response = await GET({ site: new URL(SITE) } as APIContext);
  return response.text();
}

async function parseFeed(): Promise<Record<string, unknown>> {
  return JSON.parse(await buildFeed());
}

describe('feed.json — conformité JSON Feed 1.1', () => {
  it('produit du JSON analysable', async () => {
    await expect(parseFeed()).resolves.toBeTypeOf('object');
  });

  it('ne publie aucune clé hors spec non préfixée par _', async () => {
    expect(nonConformingKeys(await parseFeed())).toEqual([]);
  });

  it('annonce la version 1.1 et les champs requis par la spec', async () => {
    const feed = await parseFeed();
    expect(feed.version).toBe('https://jsonfeed.org/version/1.1');
    expect(feed.title).toBeTypeOf('string');
    expect(Array.isArray(feed.items)).toBe(true);
  });

  it('donne un id à chaque item, seul champ requis sur un item', async () => {
    const items = (await parseFeed()).items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(config.billboards.length);
    items.forEach((item) => expect(item.id).toBeTypeOf('string'));
  });

  it('déclare son extension sous une clé préfixée', async () => {
    const items = (await parseFeed()).items as Array<Record<string, unknown>>;
    items.forEach((item) => {
      expect(item).toHaveProperty('_w00_board');
      expect(item).not.toHaveProperty('w00_board');
    });
  });
});

describe('feed.json — empreintes d’authenticité', () => {
  it('publie des empreintes qui se recalculent depuis le flux seul', async () => {
    const items = (await parseFeed()).items as Array<Record<string, any>>;

    items.forEach((item) => {
      const { canonical, fingerprint, algorithm } = item._w00_board;
      expect(algorithm).toBe('SHA-256');
      expect(createHash('sha256').update(canonical, 'utf8').digest('hex')).toBe(fingerprint);
    });
  });

  it('transporte la chaîne canonique attendue pour chaque panneau', async () => {
    const items = (await parseFeed()).items as Array<Record<string, any>>;
    expect(items.map((item) => item._w00_board.canonical))
      .toEqual(config.billboards.map(canonicalizeBillboard));
  });
});

/*
 * Un garde-fou incapable d'échouer ne protège rien.
 */
describe('nonConformingKeys — le garde-fou a des dents', () => {
  const validFeed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'T',
    items: [{ id: '1', authors: [{ name: 'W00DDY' }], _w00_board: { fingerprint: 'abc' } }],
  };

  it('accepte un flux conforme', () => {
    expect(nonConformingKeys(validFeed)).toEqual([]);
  });

  it('signale l’extension sans préfixe, le défaut visé', () => {
    const feed = { ...validFeed, items: [{ id: '1', w00_board: { fingerprint: 'abc' } }] };
    expect(nonConformingKeys(feed)).toEqual([
      'items[0].w00_board — clé absente de la spec pour un objet « item », et non préfixée par _',
    ]);
  });

  it('signale une clé inventée à la racine', () => {
    expect(nonConformingKeys({ ...validFeed, ttl: 60 })).toHaveLength(1);
  });

  it('signale une clé légale ailleurs mais illégale ici', () => {
    // `url` est valide sur un item ; à la racine la spec impose `home_page_url`.
    expect(nonConformingKeys({ ...validFeed, url: 'https://x/' })).toHaveLength(1);
  });

  it('signale une clé inventée au fond d’un auteur imbriqué', () => {
    const feed = { ...validFeed, items: [{ id: '1', authors: [{ name: 'W00DDY', email: 'x@y' }] }] };
    expect(nonConformingKeys(feed)).toEqual([
      'items[0].authors[0].email — clé absente de la spec pour un objet « author », et non préfixée par _',
    ]);
  });

  it('signale un underscore seul, qui ne nomme aucune extension', () => {
    expect(nonConformingKeys({ ...validFeed, _: 1 })).toHaveLength(1);
  });

  it('laisse libre le contenu d’une extension, comme la spec l’autorise', () => {
    const feed = { ...validFeed, _w00: { n_importe_quoi: [1, { encore: true }] } };
    expect(nonConformingKeys(feed)).toEqual([]);
  });
});

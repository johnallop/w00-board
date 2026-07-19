import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import type { APIContext } from 'astro';
import { GET } from '../pages/feed.xml';
import config from '../data/config.json';
import { canonicalizeBillboard } from '../utils/posterHash';
import { undeclaredPrefixes, unbalancedTags, textOf } from './helpers/feedConformance';

/*
 * Ces tests regardent le XML réellement produit, pas le code qui le produit.
 *
 * Motivation : `customData` est concaténé tel quel par @astrojs/rss, sans jamais
 * être analysé. Un préfixe non déclaré ou une balise non fermée y traverse donc
 * tout le build sans un avertissement — c'est ainsi que deux `<atom:link>` sous
 * un préfixe jamais déclaré ont survécu à plusieurs builds verts, alors qu'ils
 * rendaient le flux entier illisible pour un lecteur conforme.
 *
 * Le contrôleur (src/tests/helpers/feedConformance.ts) est volontairement écrit
 * à la main plutôt que délégué à fast-xml-parser : cette bibliothèque n'est pas
 * une dépendance déclarée du projet, son validateur est aveugle aux namespaces
 * (il accepte un préfixe non déclaré), et c'est elle qui sérialise le flux —
 * l'employer reviendrait à contrôler le résultat avec l'outil qui l'a produit.
 *
 * Ce fichier interroge la route en mémoire ; distArtefacts.test.ts rejoue les
 * mêmes contrôleurs sur dist/feed.xml.
 */

const SITE = 'https://w00-board.pages.dev/';

async function buildFeed(): Promise<string> {
  // `GET` ne lit que `context.site` : fournir ce seul champ suffit et évite de
  // fabriquer un faux contexte Astro complet. Cast local, jamais `as any`.
  const response = await GET({ site: new URL(SITE) } as APIContext);
  return response.text();
}

describe('feed.xml — structure du XML produit', () => {
  it('ne laisse aucune balise non refermée', async () => {
    expect(unbalancedTags(await buildFeed())).toEqual([]);
  });

  it('ne référence aucun préfixe de namespace non déclaré', async () => {
    expect(undeclaredPrefixes(await buildFeed())).toEqual([]);
  });

  it('déclare les namespaces atom et w00 sur la racine', async () => {
    const xml = await buildFeed();
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(xml).toContain('xmlns:w00="https://w00-board.pages.dev/ns/authenticity"');
  });
});

describe('feed.xml — empreintes d’authenticité', () => {
  it('publie une empreinte et une chaîne canonique par panneau', async () => {
    const xml = await buildFeed();
    expect(textOf(xml, 'w00:fingerprint')).toHaveLength(config.billboards.length);
    expect(textOf(xml, 'w00:canonical')).toHaveLength(config.billboards.length);
  });

  it('publie des empreintes qui se recalculent depuis le flux seul', async () => {
    const xml = await buildFeed();
    const fingerprints = textOf(xml, 'w00:fingerprint');

    // Rehachage à partir de ce que reçoit un consommateur — donc après passage
    // par l'échappement XML puis décodage. Un `&apos;` mal restitué donnerait
    // une empreinte différente et se verrait ici.
    textOf(xml, 'w00:canonical').forEach((canonical, i) => {
      expect(createHash('sha256').update(canonical, 'utf8').digest('hex')).toBe(fingerprints[i]);
    });
  });

  it('transporte la chaîne canonique attendue pour chaque panneau', async () => {
    const canonicals = textOf(await buildFeed(), 'w00:canonical');
    expect(canonicals).toEqual(config.billboards.map(canonicalizeBillboard));
  });
});

/*
 * Un garde-fou incapable d'échouer ne protège rien : ces cas prouvent que le
 * contrôleur détecte bien les défauts qu'il prétend couvrir, dont la régression
 * `atom:` exactement telle qu'elle était produite.
 */
describe('undeclaredPrefixes — le garde-fou a des dents', () => {
  it('signale le défaut atom: tel qu’il a échappé aux builds', () => {
    const regression = '<rss version="2.0"><channel><atom:link rel="hub" href="x"/></channel></rss>';
    expect(undeclaredPrefixes(regression)).toEqual(['atom']);
  });

  it('signale un préfixe utilisé en attribut sans déclaration', () => {
    expect(undeclaredPrefixes('<rss><item dc:creator="W00DDY"/></rss>')).toEqual(['dc']);
  });

  it('accepte un préfixe correctement déclaré', () => {
    expect(undeclaredPrefixes('<rss xmlns:w00="urn:x"><w00:f>a</w00:f></rss>')).toEqual([]);
  });

  it('accepte le préfixe xml sans déclaration, réservé par la spec', () => {
    expect(undeclaredPrefixes('<rss><item xml:lang="fr">a</item></rss>')).toEqual([]);
  });

  it('ignore un préfixe apparaissant dans le texte et non dans une balise', () => {
    expect(undeclaredPrefixes('<rss><item>voir atom:link ailleurs</item></rss>')).toEqual([]);
  });
});

describe('unbalancedTags — le garde-fou a des dents', () => {
  it('signale une balise jamais refermée', () => {
    expect(unbalancedTags('<rss><channel></rss>')).not.toEqual([]);
  });

  it('accepte les éléments auto-fermants', () => {
    expect(unbalancedTags('<rss><channel><atom:link href="x"/></channel></rss>')).toEqual([]);
  });
});

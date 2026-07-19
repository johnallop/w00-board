import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { APIContext } from 'astro';
import { GET as getFeedJson } from '../pages/feed.json';
import { GET as getFeedXml } from '../pages/feed.xml';
import { GET as getBuildJson } from '../pages/build.json';
import config from '../data/config.json';
import { canonicalizeBillboard, computeFingerprint, formatFingerprint } from '../utils/posterHash';
import { nonConformingKeys, undeclaredPrefixes, unbalancedTags } from './helpers/feedConformance';

/*
 * Les octets réellement déployés, pas ceux que les routes retournent.
 *
 * feedXml.test.ts et feedJson.test.ts appellent `GET()` en mémoire. C'était un
 * choix — un dist/ périmé ne peut pas les verdir à tort — mais il laissait un
 * trou : @playform/compress post-traite dist/feed.json et dist/build.json alors
 * que `JSON` n'est même pas listé dans astro.config.mjs (le défaut est actif).
 * Tout ce qui se passe entre la route et le fichier publié était donc hors
 * contrôle : c'est ce que ce fichier ferme.
 *
 * Il couvre au passage un risque jamais testé : la minification HTML des pages
 * qui affichent une empreinte. `formatFingerprint()` produit « 41A2 2261 BE1B
 * 467A » — des espaces *significatifs* à l'intérieur d'un `<code>`, élément qui
 * (contrairement à `<pre>`) ne préserve pas les blancs en HTML. Un minifieur qui
 * les réduirait afficherait toujours quelque chose, resterait vert partout
 * ailleurs, et rendrait l'empreinte incomparable à ce que `/verifier/` attend.
 *
 * Deux dangers propres à un test qui lit un répertoire de build, traités plus
 * bas parce qu'aucun des deux n'est théorique :
 *   1. dist/ absent  → le test se saute et l'on croit avoir vérifié.
 *   2. dist/ périmé  → le test verdit sur un artefact d'il y a trois jours.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIST = join(ROOT, 'dist');
const SITE = 'https://w00-board.pages.dev/';

/**
 * Exiger dist/ plutôt que se sauter en silence.
 *
 * Le workflow deploy.yml lance `npm test` AVANT `npm run build` : dans cet ordre
 * dist/ n'existe pas, et ce fichier s'y sauterait à chaque exécution — le trou
 * exact qu'il prétend fermer, déplacé d'un cran. La parade est une étape CI
 * post-build qui repose `W00_REQUIRE_DIST=1` : l'absence devient alors une
 * erreur dure au lieu d'un saut. Localement, sans la variable, le saut reste le
 * comportement raisonnable — on ne force personne à builder pour lancer la suite.
 */
const REQUIRE_DIST = process.env.W00_REQUIRE_DIST === '1';
const DIST_PRESENT = existsSync(join(DIST, 'feed.json'));

if (REQUIRE_DIST && !DIST_PRESENT) {
  throw new Error(
    'W00_REQUIRE_DIST=1 mais dist/feed.json est absent : lancer `npm run build` avant ce test.'
  );
}

/** Fichiers dont une modification rend dist/ périmé. */
function sourceFiles(dir = join(ROOT, 'src'), found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    // Les tests ne sont pas une entrée du build : les inclure ferait rougir ce
    // fichier à chaque fois qu'on l'édite lui-même, et un test qui crie à tort
    // est un test qu'on apprend à ignorer.
    if (entry.isDirectory()) {
      if (full === join(ROOT, 'src', 'tests')) continue;
      sourceFiles(full, found);
    } else {
      found.push(full);
    }
  }
  return found;
}

const SOURCES = [...sourceFiles(), join(ROOT, 'astro.config.mjs'), join(ROOT, 'package.json')];

/** Sources modifiées après l'écriture de l'artefact — donc non prises en compte. */
function sourcesNewerThan(artefact: string): string[] {
  const builtAt = statSync(artefact).mtimeMs;
  return SOURCES.filter((file) => statSync(file).mtimeMs > builtAt)
    .map((file) => file.slice(ROOT.length).replace(/\\/g, '/'));
}

function readDist(relative: string): string {
  return readFileSync(join(DIST, relative), 'utf8');
}

/**
 * Valeur d'un attribut, quel que soit son guillemetage.
 *
 * Le minifieur retire les guillemets quand la valeur le permet : le HTML déployé
 * porte `data-fingerprint=41a2…` et non `data-fingerprint="41a2…"`. Un motif qui
 * n'accepterait que la forme guillemetée ne trouverait rien — et « rien » se
 * confond trop facilement avec « conforme ».
 */
function attributeValues(html: string, name: string): string[] {
  const pattern = new RegExp(`${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'g');
  return Array.from(html.matchAll(pattern), (m) => m[1] ?? m[2] ?? m[3]);
}

/** Contenu textuel des éléments portant une classe donnée. */
function textOfClass(html: string, className: string): string[] {
  const pattern = new RegExp(`class=["']?${className}["']?[^>]*>([^<]*)<`, 'g');
  return Array.from(html.matchAll(pattern), (m) => m[1]);
}

async function routeText(route: (c: APIContext) => Promise<Response> | Response): Promise<string> {
  return (await route({ site: new URL(SITE) } as APIContext)).text();
}

// ---------------------------------------------------------------------------

describe.skipIf(!DIST_PRESENT)('dist/ — fraîcheur des artefacts', () => {
  /*
   * Sans ce bloc, tout ce qui suit mesurerait le passé. Un test incapable de
   * distinguer « conforme » de « pas regardé » ne vaut pas mieux que rien.
   */
  it('a été construit après la dernière modification des sources', () => {
    expect(sourcesNewerThan(join(DIST, 'feed.json'))).toEqual([]);
  });

  it('inspecte réellement les sources — le scan lui-même a des dents', () => {
    // Un chemin erroné ferait retourner une liste vide à `sourceFiles()`, aucune
    // source ne serait jamais plus récente, et le garde-fou ci-dessus serait vert
    // à perpétuité. C'est le mode de défaillance silencieuse de ce motif.
    expect(SOURCES.length).toBeGreaterThan(20);
    expect(SOURCES).toContain(join(ROOT, 'src', 'data', 'config.json'));
    expect(SOURCES).not.toContain(join(ROOT, 'src', 'tests', 'distArtefacts.test.ts'));
  });
});

describe.skipIf(!DIST_PRESENT)('dist/feed.json — après compression', () => {
  it('reste analysable une fois compressé', () => {
    expect(() => JSON.parse(readDist('feed.json'))).not.toThrow();
  });

  it('ne publie aucune clé hors spec non préfixée par _', () => {
    expect(nonConformingKeys(JSON.parse(readDist('feed.json')))).toEqual([]);
  });

  /*
   * L'assertion la plus forte du fichier, et la seule qui ne vieillit pas.
   *
   * La liste blanche JSON Feed est transcrite à la main et se démodera ; une
   * égalité entre la route et le fichier publié prouve d'un coup que la
   * compression n'a touché qu'aux blancs — toute valeur perdue, tronquée ou
   * réencodée apparaît ici sans qu'on ait eu à l'énumérer d'avance.
   */
  it('porte exactement les mêmes valeurs que la route', async () => {
    expect(JSON.parse(readDist('feed.json'))).toEqual(JSON.parse(await routeText(getFeedJson)));
  });

  it('a bien été compressé — sinon ce test ne prouve rien de neuf', async () => {
    expect(readDist('feed.json').length).toBeLessThan((await routeText(getFeedJson)).length);
  });
});

/*
 * L'autre fichier passé au compresseur JSON, et le plus sensible des deux : c'est
 * lui qui publie la recette permettant de refaire les empreintes à la main. Une
 * valeur perdue entre la route et le fichier déployé rendrait la vérification
 * indépendante impossible sans que rien ne casse visiblement.
 */
describe.skipIf(!DIST_PRESENT)('dist/build.json — après compression', () => {
  it('reste analysable une fois compressé', () => {
    expect(() => JSON.parse(readDist('build.json'))).not.toThrow();
  });

  /*
   * `commit` vient de process.env.GITHUB_SHA : c'est la seule entrée non
   * déclarative du build. L'égalité route↔artefact suppose donc que ce test
   * tourne dans le même environnement que le build qui a produit dist/ — vrai en
   * CI (même job, même variable) et en local (« dev » des deux côtés). Le test
   * qui suit rend cette hypothèse visible : s'il rougit, c'est l'environnement
   * qui a bougé, pas la compression, et le message d'échec le dira tout seul.
   */
  it('porte le commit de l’environnement qui a construit dist/', () => {
    expect(JSON.parse(readDist('build.json')).commit).toBe(process.env.GITHUB_SHA || 'dev');
  });

  it('porte exactement les mêmes valeurs que la route', async () => {
    expect(JSON.parse(readDist('build.json'))).toEqual(JSON.parse(await routeText(getBuildJson)));
  });

  it('a bien été compressé — sinon ce test ne prouve rien de neuf', async () => {
    expect(readDist('build.json').length).toBeLessThan((await routeText(getBuildJson)).length);
  });

  /*
   * La recette est une promesse faite au lecteur : « prends cette chaîne, passe-la
   * à sha256sum, tu retrouveras cette empreinte ». On la vérifie ici sur les
   * octets publiés plutôt que sur la route, parce que c'est le fichier déployé
   * que quelqu'un ira lire pour refaire le calcul.
   */
  it('publie une recette réellement rejouable sur les empreintes déployées', async () => {
    const { fingerprints } = JSON.parse(readDist('build.json'));
    expect(fingerprints.algorithm).toBe('SHA-256');
    for (const entry of fingerprints.billboards) {
      const board = config.billboards.find((b) => b.id === entry.id);
      expect(board, `panneau ${entry.id} publié mais absent de config.json`).toBeDefined();
      expect(entry.canonical).toBe(canonicalizeBillboard(board!));
      expect(entry.fingerprint).toBe(await computeFingerprint(board!));
    }
    expect(fingerprints.billboards).toHaveLength(config.billboards.length);
  });
});

describe.skipIf(!DIST_PRESENT)('dist/feed.xml — après build', () => {
  it('ne référence aucun préfixe de namespace non déclaré', () => {
    expect(undeclaredPrefixes(readDist('feed.xml'))).toEqual([]);
  });

  it('ne laisse aucune balise non refermée', () => {
    expect(unbalancedTags(readDist('feed.xml'))).toEqual([]);
  });

  it('porte les mêmes octets que la route', async () => {
    // feed.xml n'est pas dans la liste de @playform/compress. Cette égalité
    // stricte documente ce fait : si la configuration change un jour, ce test
    // rougit et force à décider si le flux doit être minifié.
    expect(readDist('feed.xml')).toBe(await routeText(getFeedXml));
  });
});

describe.skipIf(!DIST_PRESENT)('dist/b/<id>/ — empreintes après minification HTML', () => {
  const pages = config.billboards.map((board) => ({
    board,
    html: readDist(join('b', board.id, 'index.html')),
  }));

  it('conserve l’empreinte complète en attribut, guillemets ou non', async () => {
    for (const { board, html } of pages) {
      expect(attributeValues(html, 'data-fingerprint')).toEqual([await computeFingerprint(board)]);
    }
  });

  /*
   * Le cœur du risque. `<code>` ne préserve pas les blancs : une collapse de
   * whitespace transformerait « 41A2 2261 BE1B 467A » en « 41A22261BE1B467A »,
   * qui s'affiche parfaitement et ne correspond plus à rien.
   */
  it('conserve les espaces significatifs de l’empreinte lisible', async () => {
    for (const { board, html } of pages) {
      const readable = formatFingerprint(await computeFingerprint(board));
      expect(textOfClass(html, 'seal-hash')).toEqual([readable]);
      expect(readable).toMatch(/^[0-9A-F]{4}( [0-9A-F]{4}){3}$/);
    }
  });

  it('garde l’attribut et le texte cohérents entre eux', async () => {
    for (const { html } of pages) {
      const [full] = attributeValues(html, 'data-fingerprint');
      expect(textOfClass(html, 'seal-hash')).toEqual([formatFingerprint(full)]);
    }
  });

  it('garde le lien de vérification vers le bon panneau', () => {
    for (const { board, html } of pages) {
      expect(html).toContain(`/verifier/#${board.id}`);
    }
  });
});

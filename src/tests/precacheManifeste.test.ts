import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import type { AstroIntegration } from 'astro';
import {
  listerSousRessources,
  precacheManifeste,
  CHEMIN_MANIFESTE,
} from '../utils/precacheManifeste';

/*
 * Ce que ce fichier couvre, et ce qu'il ne couvre PAS.
 *
 * serviceWorker.test.ts confronte déjà le manifeste RÉEL au dist/ réel : « le
 * manifeste nomme exactement les sous-ressources livrées ». Cette garde-là est
 * la plus forte qui soit — elle lit les octets que le build vient d'écrire.
 * Mais elle a un angle mort exact : dans un build ordinaire, le répertoire que
 * le hook reçoit EST dist/. Une intégration qui écrirait bêtement dans « dist »
 * au lieu du `dir` qu'on lui passe la traverserait au vert.
 *
 * Or c'est précisément la propriété qui rend check-reproducible.mjs valide :
 * ce script rebâtit avec `--outDir ailleurs` et compare les deux sorties. Une
 * intégration sourde à `dir` écrirait le manifeste de la seconde passe dans la
 * première, laissant `ailleurs/` sans manifeste — et la comparaison signalerait
 * un fichier manquant, ou pire, ne le remarquerait pas.
 *
 * D'où ces tests-ci : ils exercent la fonction et le hook sur un répertoire
 * temporaire, donc sur un chemin qui n'a rien à voir avec dist/. C'est le seul
 * endroit du dépôt où la différence entre « le répertoire reçu » et « dist »
 * est observable.
 */

type ArgsBuildDone = Parameters<NonNullable<AstroIntegration['hooks']['astro:build:done']>>[0];

let racine = '';

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), 'w00-precache-'));
});

afterEach(() => {
  rmSync(racine, { recursive: true, force: true });
});

/** Crée `_astro/` et y dépose les noms donnés, dans l'ordre donné. */
function semer(...noms: string[]): void {
  const dossier = join(racine, '_astro');
  mkdirSync(dossier, { recursive: true });
  for (const nom of noms) writeFileSync(join(dossier, nom), 'x', 'utf8');
}

/**
 * L'argument du hook, réduit à ce que l'intégration lit réellement.
 *
 * Le cast est local et assumé : fabriquer un AstroIntegrationLogger complet et
 * de vrais RouteData n'ajouterait aucune assertion, puisque l'intégration ne
 * touche que `dir`. Un cast qui ment sur ce qui est utilisé serait un problème ;
 * celui-ci ne ment que sur ce qui est ignoré.
 */
function argsPour(dir: string): ArgsBuildDone {
  return {
    dir: pathToFileURL(dir + sep),
    pages: [],
    routes: [],
    cacheManifest: false,
  } as unknown as ArgsBuildDone;
}

/** Déclenche le hook et rend ce qu'il a écrit. */
function executerHook(dir: string): string {
  const hook = precacheManifeste().hooks['astro:build:done'];
  if (!hook) throw new Error('astro:build:done absent de l’intégration');
  hook(argsPour(dir));
  return readFileSync(join(dir, CHEMIN_MANIFESTE.slice(1)), 'utf8');
}

describe('listerSousRessources', () => {
  it('rend des chemins servis, préfixés par /_astro/', () => {
    semer('index.CAFE.css');
    expect(listerSousRessources(racine)).toEqual(['/_astro/index.CAFE.css']);
  });

  it('trie, parce que readdirSync ne promet aucun ordre', () => {
    /*
     * Le tri n'est pas cosmétique. Le manifeste est un fichier de dist/, et
     * check-reproducible.mjs exige que les octets ne varient que par des
     * entrées déclarées. Un ordre hérité du système de fichiers varierait
     * d'une machine à l'autre — vert en local, rouge en CI, pour une raison
     * que rien dans le diff n'expliquerait.
     */
    semer('zeta.js', 'alpha.css', 'milieu.js');
    expect(listerSousRessources(racine)).toEqual([
      '/_astro/alpha.css',
      '/_astro/milieu.js',
      '/_astro/zeta.js',
    ]);
  });

  it('rend une liste vide quand _astro/ est absent', () => {
    // Sans cette tolérance, un build sans sous-ressource lèverait et casserait
    // le build entier. Que ce soit une dérive POUR CE dépôt-ci est une question
    // distincte, tranchée par serviceWorker.test.ts face au vrai dist/.
    expect(listerSousRessources(racine)).toEqual([]);
  });

  it('ignore les sous-répertoires', () => {
    // Un répertoire précaché ferait échouer cache.add() à chaque installation.
    semer('vrai.css');
    mkdirSync(join(racine, '_astro', 'chunks'));
    expect(listerSousRessources(racine)).toEqual(['/_astro/vrai.css']);
  });
});

describe('hook astro:build:done', () => {
  it('écrit dans le répertoire reçu, et non dans un « dist » supposé', () => {
    // LE test que la confrontation au vrai dist/ ne peut pas faire : ici le
    // répertoire n'est pas dist/, donc une intégration qui l'ignore échoue.
    semer('a.css');
    const ecrit = JSON.parse(executerHook(racine)) as string[];
    expect(ecrit).toEqual(['/_astro/a.css']);
  });

  it('écrit un JSON lisible terminé par un saut de ligne', () => {
    // Le manifeste est destiné à être ouvert à la main sur un déploiement
    // douteux ; et un octet final qui flotterait ferait varier le CID.
    semer('a.css');
    const brut = executerHook(racine);
    expect(brut.endsWith('\n')).toBe(true);
    expect(brut).toContain('\n  "/_astro/a.css"');
  });

  it('écrit un tableau vide plutôt que rien quand _astro/ manque', () => {
    // Le worker distingue « manifeste absent » (404 → il précache moins) de
    // « manifeste vide » (dérive → le test au build la refuse). Ne rien écrire
    // confondrait les deux, et ferait passer une dérive pour un accident.
    expect(JSON.parse(executerHook(racine))).toEqual([]);
  });
});

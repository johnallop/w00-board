import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { resolveCommit } from '../utils/commit';

/*
 * Pourquoi ce fichier existe.
 *
 * Le commit était lu par `process.env.GITHUB_SHA || 'dev'`, écrit deux fois —
 * dans build.json.ts et dans sw.js.ts — sous un commentaire promettant que les
 * deux « s'accordent par construction plutôt que par vigilance ». Ils
 * s'accordaient bel et bien : sur une valeur fausse. GITHUB_SHA n'existe que
 * dans GitHub Actions, et le déploiement est fait par Cloudflare Pages, qui
 * bâtit sur son propre runner.
 *
 * Aucun test ne pouvait attraper ça, parce que tous tournaient là où la
 * variable EXISTE. Ce fichier teste la fonction, pas l'environnement de la CI.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

describe('resolveCommit', () => {
  it('préfère GITHUB_SHA quand les deux variables sont présentes', () => {
    /*
     * L'ordre n'est pas arbitraire : c'est la CI qui calcule le CID de
     * référence (deploy.yml, étape « Calculer le CID de référence »). Si un jour
     * les deux variables coexistaient avec des valeurs différentes, c'est la
     * sienne qui doit gagner, sans quoi le CID publié cesserait de désigner les
     * octets qu'elle a testés.
     */
    expect(resolveCommit({ GITHUB_SHA: 'aaa', CF_PAGES_COMMIT_SHA: 'bbb' })).toBe('aaa');
  });

  it('retombe sur CF_PAGES_COMMIT_SHA — le seul runner qui déploie vraiment', () => {
    expect(resolveCommit({ CF_PAGES_COMMIT_SHA: 'bbb' })).toBe('bbb');
  });

  it('retombe sur « dev » quand aucune variable n’est renseignée', () => {
    expect(resolveCommit({})).toBe('dev');
  });

  it('traite une variable vide comme absente', () => {
    // GitHub Actions exporte volontiers une chaîne vide plutôt que rien du tout
    // quand une expression `${{ }}` ne résout pas. `||` couvre le cas ; ce test
    // interdit de le remplacer un jour par `??`, qui ne le couvrirait plus.
    expect(resolveCommit({ GITHUB_SHA: '', CF_PAGES_COMMIT_SHA: 'bbb' })).toBe('bbb');
    expect(resolveCommit({ GITHUB_SHA: '', CF_PAGES_COMMIT_SHA: '' })).toBe('dev');
  });
});

describe('les consommateurs du commit', () => {
  /*
   * Le couplage vaut plus que la valeur. Tant que les deux routes appellent la
   * même fonction, elles ne peuvent plus diverger ; le jour où l'une d'elles
   * relit `process.env` en direct, cette garde rougit avant que la divergence
   * n'atteigne un déploiement.
   */
  const CONSOMMATEURS = ['src/pages/build.json.ts', 'src/pages/sw.js.ts'];

  it.each(CONSOMMATEURS)('%s passe par resolveCommit()', (chemin) => {
    const source = readFileSync(join(ROOT, chemin), 'utf8');
    expect(source).toContain('resolveCommit()');
  });

  it.each(CONSOMMATEURS)('%s ne lit plus GITHUB_SHA en direct', (chemin) => {
    const source = readFileSync(join(ROOT, chemin), 'utf8');
    // Les mentions en commentaire restent permises : elles expliquent le
    // pourquoi. Seule la lecture effective est interdite.
    const lectures = source
      .split(/\r?\n/)
      .filter((ligne) => /process\.env\.(GITHUB_SHA|CF_PAGES_COMMIT_SHA)/.test(ligne))
      .filter((ligne) => !/^\s*(\*|\/\/|\/\*)/.test(ligne));

    expect(
      lectures,
      `${chemin} lit une variable de commit directement. Deux lectures ` +
        'indépendantes finissent par diverger — c’est exactement ce qui a ' +
        'produit le défaut que src/utils/commit.ts corrige.'
    ).toEqual([]);
  });
});

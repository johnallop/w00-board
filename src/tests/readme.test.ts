import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Pourquoi ce fichier existe.
 *
 * L'arborescence du README annonçait « public/sw.js » longtemps après que le
 * Lot 7 l'ait déplacé vers src/pages/sw.js.ts. Ce n'était pas une inexactitude
 * ordinaire : la suite de tests INTERDIT ce fichier — s'il réapparaissait dans
 * public/, il serait recopié verbatim et masquerait la route, qui redeviendrait
 * morte. La documentation affirmait donc l'existence de ce que les tests
 * traitent comme un défaut.
 *
 * CE QUE CETTE GARDE EXIGE, ET CE QU'ELLE N'EXIGE PAS. Elle n'exige pas que
 * l'arborescence soit complète : c'est un schéma d'orientation, pas un
 * inventaire, et elle omet volontairement la plupart des utils et des tests.
 * Omettre est légitime. Inventer ne l'est pas. Seul le second est vérifié ici —
 * exiger l'exhaustivité rendrait le README pénible à maintenir et le test
 * rouge à chaque ajout de fichier, ce qui finirait par le faire désactiver.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');

/**
 * Les chemins que l'arborescence prétend exister.
 *
 * On ne lit que l'intérieur des blocs délimités par ``` : hors d'eux, une ligne
 * de prose ou de tableau (« /b/<id>/ ») ressemble assez à un chemin pour être
 * ramassée par erreur, et un test qui échoue sur une phrase serait vite ignoré.
 */
function cheminsAnnonces(markdown: string): string[] {
  const chemins: string[] = [];
  const pile: string[] = [];
  let racine: string | null = null;
  let dansUnBloc = false;

  for (const ligne of markdown.split(/\r?\n/)) {
    if (ligne.startsWith('```')) {
      dansUnBloc = !dansUnBloc;
      racine = null;
      continue;
    }
    if (!dansUnBloc) continue;

    // Une entrée : un préfixe de 4 caractères par niveau, puis ├── ou └──.
    const entree = /^((?:[│ ] {3})*)(?:├──|└──) (\S+)/.exec(ligne);

    if (!entree) {
      // Une racine : un chemin non indenté terminé par « / ».
      const tete = /^([\w.@-][\w./@-]*)\/$/.exec(ligne);
      if (tete) {
        racine = tete[1];
        pile.length = 0;
      }
      continue;
    }

    if (racine === null) continue;

    const profondeur = entree[1].length / 4;
    const nom = entree[2];

    if (nom.endsWith('/')) {
      pile.length = profondeur;
      pile.push(nom.slice(0, -1));
      continue;
    }

    chemins.push([racine, ...pile.slice(0, profondeur), nom].join('/'));
  }

  return chemins;
}

const ANNONCES = cheminsAnnonces(README);

describe('l’arborescence du README', () => {
  it('est encore lisible par cette garde', () => {
    /*
     * LE test qui empêche les autres d'être décoratifs. Si les caractères de
     * l'arbre changeaient, ou si le bloc était reformaté, l'extraction rendrait
     * une liste vide — et « tous les chemins annoncés existent » serait vrai
     * pour zéro chemin, donc vert, donc rassurant à tort.
     */
    expect(
      ANNONCES.length,
      'Aucun chemin (ou presque) n’a été lu dans l’arborescence du README : ' +
        'le format a changé et cette garde ne vérifie plus rien.'
    ).toBeGreaterThan(20);
  });

  it('ne nomme aucun fichier absent du dépôt', () => {
    const fantomes = ANNONCES.filter((chemin) => !existsSync(join(ROOT, chemin)));

    expect(
      fantomes,
      'Le README annonce des fichiers qui n’existent pas. Une arborescence ' +
        'incomplète reste utile ; une arborescence qui invente égare, et ' +
        'certains de ces fantômes sont des fichiers que les tests interdisent.'
    ).toEqual([]);
  });
});

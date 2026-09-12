import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Pourquoi ce fichier existe.
 *
 * La clé IndexNow était `e7a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5`. Elle a la longueur
 * attendue, elle a l'allure d'un hash, et elle contient `g h i j k l m n o` —
 * neuf caractères qui n'existent pas en hexadécimal. Le protocole exige une clé
 * strictement hexadécimale : chaque soumission était rejetée.
 *
 * Rien ne pouvait le voir. La valeur était écrite deux fois (dans le script et
 * dans le nom du fichier publié), les deux copies s'accordaient, l'échec HTTP
 * partait dans un `console.warn`, et l'étape tournait en `continue-on-error`.
 * Quatre couches de silence pour un défaut qu'une expression régulière attrape.
 *
 * Ce test ne fait aucun appel réseau : il vérifie la seule chose qui rendait la
 * clé invalide, et le seul couplage qui pouvait la faire diverger à nouveau.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PUBLIC = join(ROOT, 'public');

/** Les fichiers de `public/` qui ressemblent à une clé IndexNow publiée. */
const CANDIDATS = readdirSync(PUBLIC).filter((nom) => /^[0-9a-f]{8,128}\.txt$/.test(nom));

describe('la clé IndexNow publiée', () => {
  it('est le seul fichier de clé de public/', () => {
    /*
     * Deux clés, c'est une clé de trop : `announce.mjs` en choisirait une
     * arbitrairement (ordre de readdirSync), et l'ancienne continuerait d'être
     * servie. C'est le scénario exact d'une rotation de clé mal terminée.
     */
    expect(
      CANDIDATS,
      'public/ doit contenir exactement un fichier « <clé hexadécimale>.txt ». ' +
        'Après une rotation, supprimer l’ancien.'
    ).toHaveLength(1);
  });

  it('porte un nom strictement hexadécimal', () => {
    /*
     * La garde qui manquait. Le filtre de CANDIDATS impose déjà la forme — donc
     * une clé non hexadécimale ne serait PAS candidate, et le test précédent
     * échouerait avec 0 fichier. Celui-ci nomme la raison, pour que le message
     * d'échec dise « la clé n'est pas hexadécimale » plutôt que « 0 fichier ».
     */
    const tousLesTxt = readdirSync(PUBLIC).filter(
      (nom) => nom.endsWith('.txt') && nom !== 'robots.txt'
    );

    expect(
      tousLesTxt.filter((nom) => !/^[0-9a-f]{8,128}\.txt$/.test(nom)),
      'IndexNow n’accepte qu’une clé hexadécimale de 8 à 128 caractères. Une clé ' +
        'qui contient d’autres lettres est rejetée à chaque soumission, en silence.'
    ).toEqual([]);
  });

  it('a un contenu identique à son nom', () => {
    // IndexNow récupère https://<host>/<clé>.txt et compare son contenu à la
    // clé soumise. Une divergence invalide la soumission aussi sûrement qu'une
    // clé mal formée.
    const nom = CANDIDATS[0]!;
    const cle = nom.slice(0, -'.txt'.length);
    expect(readFileSync(join(PUBLIC, nom), 'utf8').trim()).toBe(cle);
  });
});

describe('announce.mjs', () => {
  const SOURCE = readFileSync(join(ROOT, 'scripts', 'announce.mjs'), 'utf8');

  it('dérive la clé du fichier au lieu de la recopier', () => {
    /*
     * Le fond du défaut n'était pas la valeur, c'était la duplication : deux
     * copies d'un même fait ne se contredisent pas, mais elles se trompent
     * ensemble. Cette garde interdit la copie, pas la faute de frappe.
     */
    expect(SOURCE).toContain('cleIndexNow()');

    const cle = CANDIDATS[0]!.slice(0, -'.txt'.length);
    expect(
      SOURCE.includes(`'${cle}'`) || SOURCE.includes(`"${cle}"`),
      'La clé est écrite en dur dans announce.mjs alors qu’elle est déjà portée ' +
        'par le nom du fichier de public/. Une des deux copies finira par mentir.'
    ).toBe(false);
  });

  it('rend un échec IndexNow visible hors du corps des logs', () => {
    // Sous `continue-on-error: true`, un console.warn n'est lu par personne.
    expect(SOURCE).toContain('::warning');
  });
});

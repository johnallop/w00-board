import { describe, it, expect } from 'vitest';
import { decrireDifference } from '../../scripts/lib/diff-octets.mjs';

/*
 * Ce que ce contrôle protège.
 *
 * decrireDifference est la seule chose qu'un humain verra pour diagnostiquer un
 * build non reproductible : check-reproducible.mjs rebâtit, compare des SHA-256,
 * et affiche une ligne par fichier divergent. Il n'y a pas de second écran, pas
 * d'artifact à télécharger, pas de diff à rouvrir.
 *
 * Le défaut corrigé : la fonction ne renvoyait que les deux tailles. Or les
 * défauts de reproductibilité attendus ici — horodatage embarqué, UUID, ordre
 * d'itération — conservent tous la longueur. Le message le plus fréquent était
 * donc « 12345 o attendus, 12345 o obtenus » sous le titre « Octets instables » :
 * un diagnostic qui plaide contre son propre contrôle, et fait classer un vrai
 * défaut en faux positif.
 *
 * Ces cas verrouillent l'inverse : quand deux fichiers diffèrent, le message le
 * DIT, et dit où.
 */

const bin = (...octets: number[]) => new Uint8Array(octets);
const txt = (s: string) => new TextEncoder().encode(s);

describe('decrireDifference — le diagnostic de non-reproductibilité', () => {
  it('signale un écart entre deux fichiers de MÊME taille', () => {
    // Le cas porteur. C'est la forme que prend presque tout défaut réel de
    // reproductibilité : un horodatage à largeur fixe qui change de valeur.
    const attendu = txt('{"genere":"2026-07-19T10:00:00Z"}');
    const obtenu = txt('{"genere":"2026-07-19T10:00:41Z"}');
    expect(attendu.length, 'le cas de test doit bien porter sur deux tailles égales').toBe(
      obtenu.length
    );

    const message = decrireDifference(attendu, obtenu);

    expect(
      message,
      'Deux fichiers de même taille dont les octets diffèrent produisent un ' +
        'message qui ne mentionne aucun écart. Affiché sous « Octets instables », ' +
        'il se lit comme un outil cassé et fait classer un vrai défaut de ' +
        'reproductibilité en faux positif. C’est le cas le plus FRÉQUENT : ' +
        'horodatage, UUID, ordre d’itération conservent tous la longueur.'
    ).toMatch(/écart/);

    // Et il faut pouvoir aller au bon endroit sans rouvrir le fichier.
    expect(message, 'le message ne situe pas l’écart').toMatch(/octet 2[0-9]/);
    expect(message, 'le message ne montre pas les deux versions').toContain('10:00:41Z');
  });

  it('situe l’écart en ligne et colonne dans un fichier texte', () => {
    const attendu = txt('ligne un\nligne deux\nvaleur = A\n');
    const obtenu = txt('ligne un\nligne deux\nvaleur = B\n');
    const message = decrireDifference(attendu, obtenu);

    expect(
      message,
      'Un écart en troisième ligne n’est pas rapporté comme tel : le lecteur ' +
        'doit compter les octets à la main pour retrouver l’endroit.'
    ).toContain('ligne 3');
    expect(message).toContain('colonne 10');
  });

  it('rend visibles les écarts qui ne portent que sur des blancs', () => {
    // Sans échappement, les deux fragments s'afficheraient identiques : le
    // lecteur conclurait de nouveau à un outil cassé, pour la même raison.
    const message = decrireDifference(txt('a\tb'), txt('a b'));
    expect(
      message,
      'Un écart tabulation / espace produit deux fragments visuellement ' +
        'identiques : le message affirme une différence qu’il ne montre pas.'
    ).toContain('→');
  });

  it('bascule en hexadécimal sur du binaire, sans passer par une liste d’extensions', () => {
    // En-tête PNG : le NUL en position 3 suffit à classer, aucune table à tenir.
    const attendu = bin(0x89, 0x50, 0x4e, 0x00, 0x0d, 0x0a, 0x1a, 0x0a, 0xff);
    const obtenu = bin(0x89, 0x50, 0x4e, 0x00, 0x0d, 0x0a, 0x1a, 0x0a, 0x2a);
    const message = decrireDifference(attendu, obtenu);

    expect(
      message,
      'Un écart binaire n’est pas rapporté en hexadécimal : le fragment UTF-8 ' +
        'd’un PNG est du charabia, et un octet non imprimable peut disparaître ' +
        'entièrement à l’affichage.'
    ).toContain('0xff attendu');
    expect(message).toContain('0x2a obtenu');
  });

  it('rapporte les deux tailles quand elles diffèrent', () => {
    const message = decrireDifference(txt('abc'), txt('abcdef'));
    expect(message).toContain('3 o attendus, 6 o obtenus');
  });

  it('nomme le côté tronqué quand l’un est le préfixe de l’autre', () => {
    // Il n'y a pas deux octets à opposer : lire attendu[3] rendrait `undefined`
    // et « 0xundefined attendu ». Le cas a sa propre phrase.
    const message = decrireDifference(txt('abc'), txt('abcdef'));
    expect(
      message,
      'Un fichier tronqué produit un message construit sur un octet inexistant.'
    ).toMatch(/s’arrête/);
    expect(message).not.toContain('undefined');
  });

  it('avoue une comparaison incohérente au lieu d’inventer un écart', () => {
    // L'appelant n'appelle QUE sur empreintes divergentes. Y arriver avec des
    // octets identiques veut dire que la comparaison amont est fausse — le pire
    // résultat serait une phrase plausible qui envoie chercher au mauvais endroit.
    const message = decrireDifference(txt('pareil'), txt('pareil'));
    expect(
      message,
      'Des octets identiques produisent un message d’écart : le lecteur ' +
        'cherchera une non-reproductibilité inexistante au lieu du bug de ' +
        'comparaison qui l’a amené là.'
    ).toMatch(/incohérence/);
  });

  it('bloque un appel malformé au lieu de lever au milieu du rapport', () => {
    // Même doctrine que verdictSurLesEcarts (src/tests/carVerdict.test.ts) : le
    // cast EST le sujet. TypeScript lit la JSDoc du .mjs — d'où son refus ici —
    // mais `checkJs` est désactivé, et le seul appelant réel est un .mjs. La
    // frontière que TS protège n'est pas celle qui compte.
    const malforme = 'des octets' as unknown as Uint8Array;
    expect(
      decrireDifference(malforme, txt('abc')),
      'Un appel malformé lève une trace de pile au milieu du rapport de ' +
        'reproductibilité, où elle se lit comme un symptôme du build.'
    ).toMatch(/Comparaison impossible/);
  });

  it('borne sa sortie : un fichier volumineux ne déverse pas ses octets dans les logs', () => {
    const gros = txt('x'.repeat(200_000) + 'A');
    const autre = txt('x'.repeat(200_000) + 'B');
    const message = decrireDifference(gros, autre);
    expect(
      message.length,
      'Le diagnostic recopie le fichier dans les logs CI : une poignée de ' +
        'fichiers divergents suffirait à rendre la sortie illisible.'
    ).toBeLessThan(500);
  });
});

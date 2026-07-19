import { describe, it, expect } from 'vitest';
import { verdictSurLesEcarts } from '../../scripts/lib/car-verdict.mjs';

/*
 * Ce que ce contrôle protège.
 *
 * verdictSurLesEcarts est le dernier arbitre avant l'épinglage : il décide si
 * l'archive CAR qu'on s'apprête à publier sous le nom IPNS reflète bien le dist/
 * que les tests ont validé. C'était jusqu'ici la seule politique du dépôt sans
 * aucun test — check-cid.mjs appelle `process.exit()` à son plus haut niveau,
 * donc la fonction n'était pas importable. D'où son extraction dans scripts/lib.
 *
 * L'assouplissement que ces cas rendent impossible : tolérer les chemins
 * commençant par « . ». Il est tentant parce qu'ipfs-car les écarte lui-même —
 * mais ce sont exactement les fichiers que ce contrôle est le seul à pouvoir
 * voir (les CID des deux jobs concordent en les ignorant tous les deux).
 * Les tolérer, c'est garder le contrôle vert en le supprimant.
 */

describe('verdictSurLesEcarts — complétude du CAR avant épinglage', () => {
  it('laisse passer quand le CAR reflète exactement dist/', () => {
    // Sans ce cas, un verdict qui bloque TOUJOURS passerait tous les autres.
    expect(
      verdictSurLesEcarts([], []),
      'Aucun écart entre dist/ et le CAR, et pourtant la publication est bloquée : ' +
        'plus aucun déploiement ne peut aboutir.'
    ).toBeNull();
  });

  it('bloque un fichier de dist/ absent du miroir, « . » compris', () => {
    const verdict = verdictSurLesEcarts(['.well-known/nostr.json'], []);
    expect(
      verdict,
      'Un chemin en « . » présent dans dist/ mais absent du CAR ne bloque plus. ' +
        "C'est le seul défaut que ce contrôle sache voir : ipfs-car écarte ces " +
        'chemins par défaut, donc les deux jobs calculent le MÊME CID en les ' +
        'ignorant tous les deux, et la comparaison de CID ne peut rien signaler. ' +
        'Le fichier serait servi par Cloudflare et introuvable sur le miroir IPFS. ' +
        "Ne pas ajouter d'exception pour les chemins en « . » : rétablir le blocage " +
        'dans scripts/lib/car-verdict.mjs.'
    ).toBeTruthy();
  });

  it('bloque une entrée du CAR qui ne vient pas de dist/', () => {
    expect(
      verdictSurLesEcarts([], ['node_modules/.package-lock.json']),
      "Le CAR contient une entrée absente de dist/ et la publication continue : " +
        "l'archive ne vient pas du dossier qu'on croit, et on s'apprête à " +
        'épingler ce contenu-là sous le nom public.'
    ).toBeTruthy();
  });

  it('bloque quand les deux directions sont en écart', () => {
    expect(
      verdictSurLesEcarts(['.well-known/nostr.json'], ['tmp/scratch.txt']),
      'Écart dans les deux sens et pourtant rien ne bloque.'
    ).toBeTruthy();
  });

  it('nomme la direction de l’écart dans le titre', () => {
    // Le titre est ce qui remonte dans l'annotation d'échec du job ; le détail
    // (la liste des chemins) n'y apparaît pas. « Le CAR ne reflète pas dist/ »
    // seul obligeait à rouvrir les logs pour savoir de quel côté regarder.
    const manquant = verdictSurLesEcarts(['a.txt'], []);
    const enTrop = verdictSurLesEcarts([], ['b.txt']);
    expect(
      manquant,
      'Les deux directions produisent le même titre : le lecteur de ' +
        "l'annotation CI ne sait pas si un fichier manque au miroir ou si " +
        "l'archive contient autre chose que dist/."
    ).not.toBe(enTrop);
  });

  it('bloque un appel malformé au lieu de le lire comme « aucun écart »', () => {
    // Si l'appelant change et cesse de passer des tableaux, le pire résultat
    // possible est un null silencieux : un contrôle qui se désactive tout seul,
    // exactement ce que check-cid.mjs refuse déjà sur `--expect ""`.
    //
    // Le cast est le sujet du test, pas un contournement. TypeScript lit bien la
    // JSDoc de car-verdict.mjs — c'est pourquoi il refuse `undefined` ICI — mais
    // `checkJs` n'est pas activé : les .mjs eux-mêmes ne sont jamais diagnostiqués.
    // Le seul appelant réel, check-cid.mjs, est précisément un .mjs. Ce que TS
    // protège, c'est donc cette frontière-ci et pas celle qui compte.
    const malforme = undefined as unknown as string[];
    expect(
      verdictSurLesEcarts(malforme, []),
      'Un appel malformé passe pour « aucun écart » : le contrôle se désactive ' +
        'silencieusement au lieu de signaler que la comparaison n’a pas eu lieu.'
    ).toBeTruthy();
  });
});

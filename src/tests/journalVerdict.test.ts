import { describe, it, expect } from 'vitest';
import { verdictSurLeJournal } from '../../scripts/lib/journal-verdict.mjs';

/*
 * Ce fichier teste le remplacement d'une politique par une déduction.
 *
 * update-ipns.mjs décidait ici par `quandLeJournalEstAbsent()`, qui renvoyait
 * 'ignorer' : un journal sans CID sortait en 0, silencieusement. Le raisonnement
 * était qu'un dépôt neuf n'a rien épinglé et qu'échouer chaque lundi produirait
 * un voyant rouge permanent.
 *
 * Les workflows démentent la prémisse — voir l'en-tête de
 * scripts/lib/journal-verdict.mjs. Le dépôt neuf n'atteint jamais cette
 * fonction : heartbeat.yml le filtre par `git ls-remote --exit-code`. Quand
 * cette fonction s'exécute, la branche ipfs-history existe, donc un CID y a été
 * inscrit — et un journal vide veut dire qu'il a disparu.
 *
 * Le cas décisif est donc « journal vide → abandonner » : c'est celui qui, avant
 * ce lot, rendait un succès.
 */

const CID = 'bafybeih72jcva24dzyr3abeonigo523ssqyr54hmt3rjdkfy2zxjegi5u4';
const SHA = '4f3a1c9e2b7d8054aa61f39c0e5b72d84c1a6f30';
const ENTREE = `2026-07-18T09:17:03Z ${SHA} ${CID}`;

describe('verdictSurLeJournal — journal exploitable', () => {
  it('publie le CID de la dernière entrée', () => {
    const v = verdictSurLeJournal(ENTREE, 'history/CIDS.log');
    expect(v.action).toBe('publier');
    expect(v.cid).toBe(CID);
  });

  it('dit d’où vient le CID, pour qu’un log suffise à le retracer', () => {
    const v = verdictSurLeJournal(ENTREE, 'history/CIDS.log');
    expect(v.details.join(' ')).toContain('w3 up');
  });
});

describe('verdictSurLeJournal — journal vide (le cas décisif)', () => {
  /*
   * LA RÉGRESSION À EMPÊCHER. Avant ce lot, ces deux entrées produisaient une
   * sortie 0 et un `verified=skipped`. Le heartbeat affichait « Rien à
   * rafraîchir » alors que le journal d'épinglages avait disparu d'une branche
   * qui existe — l'incident se lisait comme une absence de travail.
   */
  it.each([
    ['fichier absent', null],
    ['fichier sans entrée', ''],
    ['fichier de lignes blanches', '\n\n  \n'],
  ])('abandonne au lieu d’ignorer (%s)', (_, contenu) => {
    const v = verdictSurLeJournal(contenu, 'history/CIDS.log');
    expect(
      v.action,
      'Un journal vide arrive ici alors que heartbeat.yml a déjà prouvé que la ' +
        'branche ipfs-history existe : un CID y a donc été inscrit et n’y est ' +
        'plus. Rendre « publier » republierait un CID nul ; rendre un succès ' +
        'ferait passer une perte de journal pour une absence de travail.'
    ).toBe('abandonner');
    expect(v.cid).toBeNull();
  });

  /*
   * dernierCidConnu confond les deux sous-cas — `String(contenu ?? '')` rend le
   * même code 'vide' pour null et pour ''. La distinction n'existe que chez
   * l'appelant, et elle compte : un fichier supprimé et un fichier vidé ne se
   * réparent pas au même endroit.
   */
  it('distingue « introuvable » de « sans entrée » dans le diagnostic', () => {
    const absent = verdictSurLeJournal(null, 'history/CIDS.log');
    const vide = verdictSurLeJournal('', 'history/CIDS.log');

    expect(absent.resume).toContain('introuvable');
    expect(vide.resume).toContain('sans entrée');
    expect(
      absent.details.join(' '),
      'Les deux sous-cas rendent le même diagnostic : la distinction faite ici ' +
        'ne survit pas jusqu’au lecteur des logs, qui ne saura pas quoi réparer.'
    ).not.toBe(vide.details.join(' '));
  });

  it('énonce pourquoi c’est anormal, pas seulement que ça l’est', () => {
    // Un « journal vide » sans sa raison se lit comme un dépôt neuf : c'est
    // exactement la lecture que ce lot corrige. Le message doit porter la
    // déduction, sinon elle reste dans un commentaire que personne ne relit.
    const details = verdictSurLeJournal(null, 'history/CIDS.log').details.join(' ');
    expect(details).toContain('ipfs-history');
    expect(details).toContain('même push');
  });

  it('cite le fichier lu', () => {
    const v = verdictSurLeJournal(null, 'runner/tmp/CIDS.log');
    expect(v.details.join(' ')).toContain('runner/tmp/CIDS.log');
  });
});

describe('verdictSurLeJournal — journal illisible', () => {
  it.each([
    ['dernière ligne tronquée', `${ENTREE}\ncid: bafy…tronqué`],
    ['CID malformé', `2026-07-18T09:17:03Z ${SHA} bafy-pas-un-cid`],
    ['colonnes inversées', `2026-07-18T09:17:03Z ${CID} ${SHA}`],
  ])('abandonne sans retomber sur une entrée antérieure (%s)', (_, contenu) => {
    const v = verdictSurLeJournal(contenu, 'history/CIDS.log');
    expect(v.action).toBe('abandonner');
    expect(v.cid).toBeNull();
  });

  it('conserve le diagnostic de last-cid.mjs au lieu de le remplacer', () => {
    // Seul 'vide' change de lecture dans ce lot. Écraser les détails de
    // 'illisible' ferait perdre la valeur fautive, qui est ce qu'on ouvre le
    // fichier pour chercher.
    const v = verdictSurLeJournal(`2026-07-18T09:17:03Z ${SHA} bafy-pas-un-cid`);
    expect(v.details.join(' ')).toContain('bafy-pas-un-cid');
  });
});

describe('verdictSurLeJournal — invariants de tous les refus', () => {
  it.each([
    ['vide', null],
    ['illisible', 'n’importe quoi'],
  ])('rappelle la doctrine de publication (%s)', (_, contenu) => {
    const v = verdictSurLeJournal(contenu, 'history/CIDS.log');
    expect(v.details.join(' ')).toContain('mieux vaut un nom qui vieillit');
  });
});

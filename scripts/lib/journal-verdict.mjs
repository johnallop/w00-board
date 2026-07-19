/**
 * Que faire quand le journal des épinglages n'atteste aucun CID.
 *
 * CE MODULE REMPLACE UNE POLITIQUE PAR UNE DÉDUCTION.
 *
 * update-ipns.mjs portait ici un `quandLeJournalEstAbsent()` dont le docblock
 * concluait : « Le script ne peut pas distinguer les deux situations : il ne
 * voit qu'un fichier manquant. C'est donc une politique, pas une déduction. »
 * Les deux situations étaient « dépôt neuf, rien n'a jamais été épinglé » —
 * bénin, à ignorer — et « le journal a disparu » — incident, à signaler.
 *
 * Cette prémisse est fausse, et ce sont les workflows qui la démentent.
 *
 *   1. heartbeat.yml est le SEUL appelant de `--depuis-log` ; deploy.yml passe
 *      toujours un CID explicite, fraîchement épinglé.
 *   2. Avant d'appeler le script, heartbeat.yml exécute
 *      `git ls-remote --exit-code --heads origin ipfs-history`. Code 2 —
 *      branche absente — sort en 0 sans jamais lancer node. Le dépôt neuf
 *      n'atteint donc PAS cette fonction : il est filtré une étape plus tôt.
 *   3. Dans deploy.yml, la branche et la première ligne du journal naissent du
 *      même push : `git switch --orphan ipfs-history` ne crée qu'une ref
 *      locale, et le `git push` qui la publie porte déjà le commit issu de
 *      `echo … >> CIDS.log` + `git add` + `git commit`. Une ref est mise à jour
 *      atomiquement : il n'existe aucun état normal où la branche existe sans
 *      son journal.
 *
 * Conclusion : quand cette fonction s'exécute, la branche ipfs-history est
 * prouvée présente sur origin, donc au moins un CID y a été inscrit. Un journal
 * sans entrée ne veut plus dire « rien à faire », il veut dire « ce qui existait
 * n'est plus là ». C'est un incident, et le verdict est d'abandonner.
 *
 * LA CRAINTE D'ORIGINE EST TRAITÉE, PAS IGNORÉE. L'ancien docblock redoutait
 * « un voyant rouge permanent qu'on apprendrait vite à ne plus regarder » sur un
 * dépôt neuf. Ce voyant ne s'allume pas : le cas est absorbé par la garde
 * `ls-remote`, qui rend `verified=skipped` — le heartbeat reste vert et le dit.
 *
 * CE DONT LA DÉDUCTION DÉPEND. Elle n'est valide que tant que (2) et (3)
 * tiennent. Retirer la garde `ls-remote` de heartbeat.yml, ou réécrire l'étape
 * « Tracer le CID » pour pousser la branche avant d'y écrire, rendrait ce
 * fichier faux sans y toucher une ligne — et rallumerait exactement le voyant
 * rouge permanent qu'on vient d'écarter. src/tests/workflowCoupling.test.ts
 * épingle ces deux propriétés et explique, en cas d'échec, que c'est cette
 * déduction-ci qui vient de tomber.
 *
 * LES DEUX SOUS-CAS RESTENT DISTINCTS DANS LE MESSAGE. dernierCidConnu les
 * confond volontairement — `String(contenu ?? '')` donne le même code 'vide'
 * pour un fichier absent et pour un fichier vide — mais la réparation, elle,
 * diffère. Seul l'appelant sait lequel des deux il a lu ; c'est donc ici, où
 * `contenu === null` est encore observable, que la distinction doit être faite.
 *
 * Fonction pure, sans I/O — dans scripts/lib pour être testable
 * (src/tests/journalVerdict.test.ts) : update-ipns.mjs appelle `process.exit()`
 * à son plus haut niveau, l'importer tuerait le worker vitest.
 */
import { dernierCidConnu } from './last-cid.mjs';

/**
 * Pourquoi un journal vide est anormal ici, selon qu'on ait lu un fichier
 * absent ou un fichier sans ligne. Les deux sont des incidents ; ils ne se
 * réparent pas au même endroit.
 */
function pourquoiVideEstAnormal(absent) {
  const commun = [
    'La branche ipfs-history existe (heartbeat.yml l’a vérifiée par',
    '`git ls-remote --exit-code` avant d’appeler ce script), donc au moins un',
    'CID y a déjà été inscrit : deploy.yml crée la branche et sa première',
    'ligne de journal dans le même push.',
  ].join(' ');

  return absent
    ? [
        commun,
        'CIDS.log est pourtant introuvable : le fichier a été supprimé de la',
        'branche, ou l’historique a été réécrit par un push forcé.',
      ]
    : [
        commun,
        'CIDS.log est pourtant sans entrée : deploy.yml n’y ajoute que des',
        'lignes, jamais n’en retire — le fichier a donc été vidé.',
      ];
}

/**
 * Le verdict sur le journal des épinglages.
 *
 * @param {string|null|undefined} contenu contenu de CIDS.log, `null` si le fichier est absent
 * @param {string} fichier chemin lu, cité dans le diagnostic
 * @returns {{action:'publier'|'abandonner', cid:string|null, resume:string, details:string[]}}
 */
export function verdictSurLeJournal(contenu, fichier = 'CIDS.log') {
  const journal = dernierCidConnu(contenu);

  if (journal.ok) {
    return {
      action: 'publier',
      cid: journal.cid,
      resume: journal.resume,
      details: ['(source : CIDS.log, écrit après un `w3 up` réussi)'],
    };
  }

  // Seul 'vide' change de lecture : 'illisible' et 'format' étaient déjà des
  // refus, pour la raison inscrite dans last-cid.mjs — un journal qu'on ne
  // comprend plus ne doit pas être interprété au mieux.
  const details =
    journal.code === 'vide' ? pourquoiVideEstAnormal(contenu === null) : journal.details;

  const resume =
    journal.code === 'vide'
      ? `Journal des épinglages ${contenu === null ? 'introuvable' : 'sans entrée'} alors que la branche ipfs-history existe.`
      : journal.resume;

  return {
    action: 'abandonner',
    cid: null,
    resume,
    details: [
      `fichier : ${fichier}`,
      ...details,
      'Publication refusée : mieux vaut un nom qui vieillit qu’un nom qui ment.',
    ],
  };
}

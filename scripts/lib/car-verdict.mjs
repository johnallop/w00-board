/**
 * Politique de complétude du CAR : un écart entre dist/ et l'archive doit-il
 * bloquer l'épinglage ?
 *
 * Contexte, détaillé dans l'en-tête de scripts/check-cid.mjs (contrôle 2) :
 * comparer deux CID produits par le même outil sur le même contenu ne peut pas
 * révéler ce que cet outil écarte systématiquement. `ipfs-car pack` ignore par
 * défaut tout chemin commençant par « . ». Un dist/.well-known/nostr.json serait
 * donc absent du miroir dans les DEUX jobs, et les CID concorderaient sans
 * broncher. Confronter l'arbre réel du CAR à celui de dist/ est le seul contrôle
 * qui puisse voir ce trou — et cette fonction est ce qui décide quoi en faire.
 *
 * LA RÈGLE : LES DEUX DIRECTIONS BLOQUENT, SANS LISTE D'EXCEPTIONS.
 *
 * Cette fonction a longtemps porté un `TODO(contribution)` qui qualifiait son
 * propre comportement de « peut-être trop strict » et invitait à l'assouplir.
 * L'assouplissement évident consiste à tolérer les chemins en « . », puisque
 * c'est précisément ce qu'ipfs-car écarte. C'est le raisonnement à l'envers :
 * ces fichiers-là sont la seule chose que ce contrôle sait voir, et les
 * tolérer reviendrait à supprimer le contrôle en le gardant vert.
 *
 * Une liste d'exceptions ne se raccourcit jamais. Le jour où quelqu'un y ajoute
 * `.nojekyll` — inoffensif, effectivement inutile sur IPFS — la ligne existe, et
 * l'exception suivante se justifiera par la présence de la première plutôt que
 * par ses propres mérites. C'est la doctrine déjà inscrite dans deploy.yml à
 * propos du passage des valeurs par `env:` : « la règle est sans exception à
 * dessein », parce que « ce cas-là est sûr » est un raisonnement qu'il faudrait
 * refaire entièrement à chaque relecture, et qui finit par être appliqué une
 * fois de trop.
 *
 * Le coût d'un faux positif est connu et petit : un job rouge, un humain qui
 * lit le détail affiché par l'appelant, et soit le fichier compte — il faut le
 * sortir du dossier « . » — soit il ne compte pas — il faut le sortir de dist/.
 * Les deux réponses sont des corrections réelles. Le coût d'un faux négatif est
 * un miroir incomplet publié sous le nom IPNS, invisible jusqu'à ce qu'un
 * visiteur cherche le fichier manquant.
 *
 * Ce n'est donc pas un placeholder en attente d'affinage : c'est la politique.
 *
 * Fonction pure, sans I/O — extraite de check-cid.mjs pour être testable
 * (src/tests/carVerdict.test.ts). Le script, lui, appelle `process.exit()` à son
 * plus haut niveau : l'importer depuis un test tuerait le worker vitest.
 */

/**
 * Décide si un écart entre dist/ et le CAR doit bloquer la publication.
 *
 * `absents` — présents dans dist/, absents du CAR : servis par Cloudflare mais
 *             introuvables sur le miroir IPFS. Cause quasi certaine : un chemin
 *             commençant par « . », qu'ipfs-car écarte sans le dire.
 * `enTrop`  — présents dans le CAR, absents de dist/. Ne devrait pas arriver ;
 *             signifie que l'archive ne vient pas du dossier qu'on croit.
 *
 * Le message renvoyé est un titre : l'appelant affiche ensuite la liste des
 * chemins concernés. Il nomme malgré tout la direction de l'écart, parce que
 * c'est cette ligne-là qui remonte dans l'annotation d'échec du job, où le
 * détail n'apparaît pas.
 *
 * @param {string[]} absents
 * @param {string[]} enTrop
 * @returns {string | null} un message bloquant, ou null pour laisser passer
 */
export function verdictSurLesEcarts(absents, enTrop) {
  // Un appelant qui passe autre chose que des tableaux est un défaut de
  // programmation, pas un dist/ conforme. Le laisser lever `.length of
  // undefined` donnerait une trace de pile ; le laisser passer pour « aucun
  // écart » donnerait un contrôle qui se désactive tout seul — le travers que
  // check-cid.mjs refuse déjà sur `--expect ""`. On bloque, en le disant.
  if (!Array.isArray(absents) || !Array.isArray(enTrop)) {
    return 'Comparaison impossible : verdictSurLesEcarts attend deux tableaux de chemins.';
  }

  if (!absents.length && !enTrop.length) return null;

  if (absents.length && enTrop.length) {
    return `Le CAR ne reflète pas dist/ : ${absents.length} entrée(s) absente(s) du miroir, ${enTrop.length} en trop.`;
  }
  if (absents.length) {
    return `Le CAR ne reflète pas dist/ : ${absents.length} entrée(s) de dist/ absente(s) du miroir.`;
  }
  return `Le CAR ne reflète pas dist/ : ${enTrop.length} entrée(s) du miroir qui ne viennent pas de dist/.`;
}

/**
 * Ajustement typographique en fonction de la longueur du message.
 *
 * Un panneau doit se lire à distance : la police est donc dimensionnée sur le
 * viewport (`clamp(…, 11vw, …)`). Mais un `vw` ignore la longueur du texte,
 * alors que la contrainte réelle d'un panneau plein écran est la HAUTEUR.
 *
 * Mesuré sur /live à 1440×900 avec un message de 178 caractères : 12 lignes,
 * 1996 px de hauteur de texte pour 772 px disponibles. `.live-slide` étant
 * `position: absolute; inset: 0` dans un conteneur `overflow: hidden`, les
 * 1224 px excédentaires n'étaient pas coupés avec une barre de défilement —
 * ils étaient invisibles. Aucun indice, aucune erreur, aucun voyant.
 *
 * Le défaut n'est pas monotone : un mobile 390×844 passait pendant qu'une
 * tablette 768×1024 et un bureau 1440×900 coupaient. C'est la signature du
 * bug — la police croît avec la LARGEUR du viewport pendant que la place
 * manque en HAUTEUR, donc élargir l'écran aggrave le problème.
 *
 * Ce module fournit le facteur multiplicatif manquant, injecté en CSS via
 * `--fit`. Il est partagé avec le générateur d'images OpenGraph
 * (`scaledFontSizeFor`) : c'est le même message, il serait incohérent que
 * l'aperçu social dégrade gracieusement pendant que le panneau réel coupe.
 *
 * Fonction pure : le facteur ne dépend que du message, jamais d'une mesure du
 * navigateur ni d'une date. La sortie du build reste donc reproductible octet
 * pour octet — contrainte dure du miroir IPFS, dont le CID dépend.
 */

/** En deçà de cette longueur, le message garde la pleine taille. */
export const LONGUEUR_PLEINE_TAILLE = 40;

/**
 * La loi de décroissance, par paliers — décision de conception, pas réglage.
 *
 * Pourquoi des paliers plutôt qu'un continuum (√, linéaire, log) : le produit
 * est un MUR de panneaux, pas un panneau isolé. Deux panneaux voisins calculés
 * à 0,71 et 0,73 ne se lisent pas comme « deux longueurs différentes », ils se
 * lisent comme un défaut d'alignement — l'œil détecte l'écart de corps bien
 * avant d'en attribuer la cause. Un jeu fini de tailles produit un mur qui
 * paraît composé ; un continuum produit un mur qui paraît de travers.
 *
 * Ce que cela corrige par rapport à la loi en √ qu'elle remplace : √ sous-réduit
 * dans la traîne. À 600 caractères elle rend encore 0,258, à 1000 elle rend
 * 0,200 — la décroissance s'aplatit exactement là où le message devient
 * ingérable. Les derniers paliers descendent plus franchement.
 *
 * CONSTRUCTION — chaque palier vaut au plus √(40 / borne_haute). √ étant
 * décroissante, la valeur du palier est donc ≤ √(40 / n) pour TOUT n de son
 * intervalle : sur l'étendue du tableau, la nouvelle loi réduit au moins autant
 * que l'ancienne. C'est ce qui garantit qu'aucun des six écrans testés dans
 * fitText.test.ts ne peut se remettre à couper — la propriété est dans le
 * tableau, pas dans l'espoir.
 *
 * LIMITE DE CETTE GARANTIE, mesurée et non supposée : une constante positive ne
 * peut pas dominer une fonction qui tend vers 0. Le plancher finit donc toujours
 * par repasser AU-DESSUS de √. Avec un plancher à 0,20 le croisement tombait à
 * n = 1000, et la conséquence était réelle : sur ultrawide 2560×1080, un message
 * de 2000 caractères tenait sous l'ancienne loi (793 px pour 952 disponibles) et
 * débordait sous la nouvelle (1341 px). Le plancher est donc fixé à 0,10, ce qui
 * repousse le croisement à n = 4000 — au-delà de toute longueur de panneau
 * plausible. C'est un domaine de validité borné et annoncé, pas une propriété
 * universelle ; fitText.test.ts vérifie la borne explicitement.
 */
const PALIERS: ReadonlyArray<readonly [longueurMax: number, facteur: number]> = [
  [70, 0.75], // √(40/70)   = 0,756
  [120, 0.55], // √(40/120)  = 0,577
  [200, 0.44], // √(40/200)  = 0,447
  [320, 0.35], // √(40/320)  = 0,354
  [520, 0.27], // √(40/520)  = 0,277
  [900, 0.2], // √(40/900)  = 0,211
  [1500, 0.15], // √(40/1500) = 0,163
];

/**
 * Au-delà du dernier palier, le plancher est un aveu plutôt qu'un réglage.
 *
 * 0,10 n'est pas choisi pour le rendu — à cette échelle aucun facteur ne sauve
 * la mise en page, c'est le message qu'il faut raccourcir. Il est choisi pour
 * que le plancher du clamp CSS (2rem) reprenne la main sur tous les écrans du
 * jeu de test, 4K compris : 0,10 × la taille idéale d'un 3840×2160 (422 px)
 * donne 42 px, soit un corps que la mise en page absorbe encore.
 */
const FACTEUR_PLANCHER = 0.1;

/** Borne au-delà de laquelle la domination de √ n'est plus garantie (cf. docblock). */
export const BORNE_DOMINATION = 4000;

/**
 * Facteur multiplicatif (0 < f ≤ 1) appliqué à la taille de police idéale.
 *
 * Ne grossit JAMAIS un message court : un panneau de trois mots doit occuper
 * l'écran, pas déborder. Le plafond à 1 est donc structurel, pas cosmétique.
 *
 * @param message Le texte du panneau, tel qu'écrit dans config.json.
 * @returns Le facteur à multiplier par la taille idéale.
 */
export function fitFactorFor(message: string): number {
  // Points de code, pas unités UTF-16 : un emoji compte pour 1, pas 2.
  const length = [...message].length;
  if (length <= LONGUEUR_PLEINE_TAILLE) return 1;

  // Premier palier dont la borne couvre la longueur. Table courte et ordonnée :
  // un parcours linéaire est plus lisible ici qu'une recherche dichotomique, et
  // le coût est nul — la fonction tourne au build, pas dans une boucle de rendu.
  for (const [longueurMax, facteur] of PALIERS) {
    if (length <= longueurMax) return facteur;
  }
  return FACTEUR_PLANCHER;
}

/**
 * Le même facteur, sérialisé pour une valeur de propriété personnalisée CSS.
 *
 * `toFixed(3)` n'est pas un détail de présentation : un flottant sérialisé par
 * défaut varie en longueur (0.4740452079103168), ce qui suffirait à faire
 * diverger deux builds si la représentation changeait un jour. Trois décimales
 * fixes valent 0,1 % de précision sur la taille — invisible — et garantissent
 * une chaîne stable.
 */
export function cssFitFactor(message: string): string {
  return fitFactorFor(message).toFixed(3);
}

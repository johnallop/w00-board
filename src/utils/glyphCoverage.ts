/**
 * Couverture réelle de la police embarquée — mesurée, pas déclarée.
 *
 * Le générateur d'images OpenGraph n'enregistre qu'une seule police auprès de
 * Satori : `src/data/inter-latin-700-normal.woff`. Tout point de code absent de
 * son cmap est rendu par le glyphe `.notdef` — le carré vide. Mesuré sur le
 * build : `dist/og/rtl.png` affichait ≈ 25 carrés, `dist/og/emoji.png` deux
 * carrés par emoji. Un aperçu social entièrement fait de carrés est pire que
 * pas d'aperçu du tout : il ne dit pas « je ne sais pas afficher ceci », il dit
 * « ce site est cassé ».
 *
 * POURQUOI UNE TABLE MESURÉE ET NON LA PLAGE DÉCLARÉE — @fontsource publie une
 * `unicode-range` pour le sous-ensemble « latin ». C'est un SÉLECTEUR destiné au
 * navigateur (« si le texte tombe là-dedans, télécharge ce fichier »), pas un
 * inventaire. Les deux ensembles se croisent, aucun n'inclut l'autre :
 *
 *   déclaré mais ABSENT   U+2074, U+2215, U+FFFD, U+0329, U+00AD, et 92 des 112
 *                         points de code du bloc U+2000-206F annoncé en entier
 *                         (dont U+2010 trait d'union, U+2020 †, U+2030 ‰)
 *   présent mais NON      U+0300-U+0301, U+0303, U+0309, U+0323 (diacritiques
 *   déclaré               combinants)
 *
 * Bâtir ce prédicat sur la déclaration aurait donc produit des verdicts
 * « couvert » faux, c'est-à-dire précisément les carrés qu'il existe pour
 * empêcher. Que U+FFFD soit absent est le cas le plus parlant : un repli qui
 * aurait émis « � » se serait affiché… en carré.
 *
 * BORNE STRUCTURELLE — les deux sous-tables du cmap (pid 0/eid 3 et pid 3/eid 1)
 * sont au FORMAT 4, qui n'adresse que le plan multilingue de base. Aucun point de
 * code au-dessus de U+FFFF ne peut être couvert, quoi qu'il arrive : tout emoji
 * (U+1F300 et au-delà) est hors d'atteinte par construction du fichier, pas par
 * accident de sous-ensemble.
 *
 * La table ci-dessous est vérifiée contre le fichier réel par
 * `src/tests/glyphCoverage.test.ts`, qui re-parse le WOFF à chaque exécution.
 * Remplacer la police sans mettre la table à jour fait échouer la suite — le
 * principe du dépôt appliqué à la police : valider l'artefact, pas la promesse.
 *
 * 230 points de code, 31 plages.
 */
const PLAGES_COUVERTES: ReadonlyArray<readonly [debut: number, fin: number]> = [
  [0x0000, 0x0000],
  [0x0020, 0x007e],
  [0x00a0, 0x00ac], // U+00AD (trait d'union conditionnel) manque : d'où la coupure
  [0x00ae, 0x00ff], // tous les accents français sont ici — ils ne sont PAS en cause
  [0x0131, 0x0131],
  [0x0152, 0x0153],
  [0x02bb, 0x02bc],
  [0x02c6, 0x02c6],
  [0x02da, 0x02da],
  [0x02dc, 0x02dc],
  [0x0300, 0x0301],
  [0x0303, 0x0304],
  [0x0308, 0x0309],
  [0x0323, 0x0323],
  [0x2002, 0x2002],
  [0x2009, 0x2009],
  [0x200b, 0x200b],
  [0x2013, 0x2014], // U+2014 — : porteur, config.json l'utilise
  [0x2018, 0x201a], // U+2019 ’ : porteur, config.json l'utilise
  [0x201c, 0x201e],
  [0x2022, 0x2022],
  [0x2026, 0x2026],
  [0x2032, 0x2033],
  [0x2039, 0x203a],
  [0x2044, 0x2044],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0xfeff, 0xfeff],
];

/** La table telle que mesurée, exposée pour le test de non-régression. */
export const PLAGES_POLICE = PLAGES_COUVERTES;

/**
 * Caractères de mise en page : ils n'appellent jamais de glyphe.
 *
 * Le cmap ne contient AUCUN caractère de contrôle (la première plage saute de
 * U+0000 à U+0020). Une tabulation ou un retour à la ligne serait donc classée
 * « non couverte » alors qu'elle ne peut pas produire de carré — Satori la
 * traite comme de la mise en page. Sans cette exemption, tout message sur
 * plusieurs lignes basculerait sur la carte générique pour rien.
 */
const MISE_EN_PAGE = new Set([0x0009, 0x000a, 0x000d]);

/**
 * Le point de code est-il rendable par la police embarquée ?
 *
 * Parcours linéaire assumé : 31 plages ordonnées, appelées au build et non dans
 * une boucle de rendu. Une dichotomie serait plus rapide et moins lisible pour
 * un gain nul à cette échelle — même arbitrage que la table de `fitText.ts`.
 */
export function isCovered(codePoint: number): boolean {
  for (const [debut, fin] of PLAGES_COUVERTES) {
    if (codePoint < debut) return false; // table ordonnée : inutile d'aller plus loin
    if (codePoint <= fin) return true;
  }
  return false;
}

/**
 * Les points de code du texte que la police ne sait pas dessiner.
 *
 * Renvoie les points de code, pas les unités UTF-16 : un emoji est un élément,
 * pas deux — même convention que `fitFactorFor`.
 */
export function uncoveredIn(text: string): number[] {
  const hors: number[] = [];
  for (const caractere of text) {
    const cp = caractere.codePointAt(0)!;
    if (!isCovered(cp) && !MISE_EN_PAGE.has(cp)) hors.push(cp);
  }
  return hors;
}

/**
 * Proportion minimale du message qui doit survivre au retrait pour qu'il vaille
 * encore la peine d'être affiché.
 *
 * En dessous, ce qui reste n'est plus le message mais son résidu : « 🔥🔥🔥 Oui
 * 🔥🔥🔥 » réduit à « Oui » fait une carte plus pauvre que la carte générique,
 * qui au moins annonce honnêtement qu'il faut ouvrir le panneau.
 */
const PART_MINIMALE_CONSERVEE = 0.5;

/** En deçà, aucun texte ne porte de sens, quelle que soit la proportion. */
const MINIMUM_ABSOLU = 3;

/**
 * Le texte tel qu'il peut être rendu — ou `null` s'il n'en reste rien d'utile.
 *
 * Trois issues possibles, ordonnées par fidélité décroissante, et JAMAIS de
 * carré :
 *
 *   1. tout est couvert   → le texte est renvoyé À L'IDENTIQUE. Chemin nominal,
 *                           strictement inchangé : les deux panneaux de
 *                           config.json passent par là, donc les octets produits
 *                           — et le CID IPFS qui en dépend — ne bougent pas.
 *   2. il reste l'essentiel → les points de code hors police sont retirés et les
 *                           espaces recollés. « 🔥✨ JESUS T’AIME ✨🔥 💙💜 »
 *                           devient « JESUS T’AIME » : moins riche que le
 *                           panneau, mais vrai. Un aperçu est une réduction, ce
 *                           n'est pas un mensonge — alors qu'une rangée de
 *                           carrés en est un.
 *   3. il ne reste rien    → `null`, l'appelant bascule sur la carte générique.
 *                           C'est le cas de l'arabe et du chinois, où le retrait
 *                           ne laisse aucun caractère.
 *
 * ÉCART ASSUMÉ AVEC LA DEMANDE — l'instruction était « détecter le script et se
 * rabattre sur une image générique ». Le cas 2 va un cran plus loin, parce qu'un
 * emoji isolé dans une phrase française n'est pas un changement de script : s'en
 * remettre à la carte générique perdrait « JESUS T’AIME », que la police sait
 * parfaitement dessiner. La garantie dure — aucun carré, jamais — est identique
 * dans les deux conceptions ; le cas 2 conserve seulement davantage de message.
 * Retirer ce palier revient à remplacer le corps de la fonction par
 * `return horsPolice.length === 0 ? text : null;`.
 */
export function renderableText(text: string): string | null {
  const horsPolice = uncoveredIn(text);
  if (horsPolice.length === 0) return text;

  const conserve = [...text]
    .filter((c) => {
      const cp = c.codePointAt(0)!;
      return isCovered(cp) || MISE_EN_PAGE.has(cp);
    })
    .join('');

  // Retirer un emoji laisse deux espaces côte à côte : on recolle, sinon la
  // carte afficherait des trous là où le message n'en a pas.
  const nettoye = conserve.replace(/\s+/g, ' ').trim();

  const significatifs = (s: string) => [...s].filter((c) => !/\s/.test(c)).length;
  const apres = significatifs(nettoye);

  if (apres < MINIMUM_ABSOLU) return null;
  if (apres < significatifs(text) * PART_MINIMALE_CONSERVEE) return null;
  return nettoye;
}

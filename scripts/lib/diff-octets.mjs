/**
 * Décrire en quoi deux versions d'un même fichier de dist/ diffèrent.
 *
 * Appelée par scripts/check-reproducible.mjs une fois par fichier divergent.
 * Son résultat est TOUT ce que quelqu'un verra dans les logs CI pour
 * diagnostiquer un build non reproductible : il n'y a pas de second écran.
 *
 * POURQUOI LES TAILLES NE SUFFISENT PAS.
 *
 * Le placeholder qu'elle remplace renvoyait « N o attendus, M o obtenus ». Il
 * faut regarder quels défauts de reproductibilité changent réellement la taille
 * d'un fichier : presque aucun de ceux qu'on attend ici. Un horodatage embarqué,
 * une date au format fixe, un UUID, deux clés de Map permutées, le hinting de
 * police dans satori — tous conservent la longueur. La taille ne bouge que dans
 * le cas rare.
 *
 * Le message le plus fréquent était donc « 12345 o attendus, 12345 o obtenus »,
 * imprimé sous le titre « Octets instables ». Un diagnostic qui affirme que les
 * deux fichiers font la même taille, sous un titre qui affirme qu'ils diffèrent,
 * se lit comme un outil cassé. C'est ainsi qu'un vrai défaut se fait classer
 * faux positif — le contrôle avait raison, et son message plaidait contre lui.
 *
 * CE QU'ELLE DIT MAINTENANT : OÙ, ET QUOI.
 *
 * Le premier octet qui diffère, situé (ligne/colonne pour du texte, décalage
 * pour du binaire) et montré des deux côtés. C'est ce qui permet de reconnaître
 * un horodatage d'une permutation d'ordre sans rouvrir le fichier.
 *
 * PAS DE LISTE D'EXTENSIONS. Distinguer texte et binaire par une liste
 * (.html, .js, .css…) serait une liste d'exceptions à tenir à jour, et le
 * dépôt en refuse déjà une dans scripts/lib/car-verdict.mjs pour la raison
 * qu'elle ne se raccourcit jamais. Le renifleur d'octet NUL n'a rien à
 * maintenir : un fichier texte n'en contient pas, un PNG en contient dès son
 * en-tête. Un nouveau format arrive classé correctement sans qu'on y touche.
 *
 * Fonction pure, sans I/O — dans scripts/lib pour être testable
 * (src/tests/diffOctets.test.ts) : check-reproducible.mjs appelle
 * `process.exit()` à son plus haut niveau, l'importer tuerait le worker vitest.
 */

/** Contexte affiché de part et d'autre de l'écart. Borné : un fichier par ligne de log. */
const FENETRE_TEXTE = 30;
const FENETRE_HEX = 6;

/** Préfixe inspecté pour décider texte/binaire. Au-delà, on n'apprendrait plus rien. */
const SNIFF = 8192;

/*
 * Décodage et hexadécimal faits ici, sans passer par les méthodes de Buffer.
 *
 * `readFileSync` rend un Buffer, dont le `toString(encodage)` fait ce qu'on
 * attend — mais un Uint8Array ordinaire n'a pas cette surcharge : il tombe sur
 * `Array.prototype.toString`, IGNORE l'argument d'encodage sans rien signaler,
 * et rend « 97,9,98 ». Un diagnostic muet qui dégénère en liste de nombres selon
 * le type exact que l'appelant a sous la main est précisément le genre de panne
 * que ce fichier existe pour éviter. La signature annonce Uint8Array : elle
 * tient pour tout Uint8Array.
 *
 * `fatal: false` est délibéré : un fichier « textuel » au sens du renifleur peut
 * contenir de l'UTF-8 invalide, et un diagnostic qui lève au lieu d'afficher
 * U+FFFD ferait perdre le rapport entier pour un octet.
 */
const DECODEUR = new TextDecoder('utf-8', { fatal: false });
const enHex = (o) => o.toString(16).padStart(2, '0');

/**
 * Textuel = aucun octet NUL dans le préfixe inspecté, des deux côtés.
 *
 * Heuristique classique, et surtout sans table à maintenir : voir l'en-tête.
 */
function estTextuel(a, b) {
  for (const buf of [a, b]) {
    const limite = Math.min(SNIFF, buf.length);
    for (let i = 0; i < limite; i++) if (buf[i] === 0) return false;
  }
  return true;
}

/**
 * Décalage du premier octet qui diffère.
 *
 * Renvoie la longueur commune quand l'un est le préfixe de l'autre (le premier
 * écart est alors la présence même d'un octet), et -1 si les deux sont égaux.
 */
function premierEcart(a, b) {
  const commun = Math.min(a.length, b.length);
  for (let i = 0; i < commun; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : commun;
}

/** Ligne et colonne (1-indexées) du décalage, comme les compte un éditeur. */
function position(buf, decalage) {
  let ligne = 1;
  let debutLigne = 0;
  for (let i = 0; i < decalage; i++) {
    if (buf[i] === 0x0a) {
      ligne++;
      debutLigne = i + 1;
    }
  }
  return `ligne ${ligne}, colonne ${decalage - debutLigne + 1}`;
}

/**
 * Fenêtre de texte autour du décalage, rendue affichable sur une seule ligne.
 *
 * Les blancs deviennent visibles : un écart qui ne porte QUE sur un saut de
 * ligne ou une tabulation afficherait sinon deux fragments identiques à l'œil.
 */
function fragment(buf, decalage) {
  const debut = Math.max(0, decalage - FENETRE_TEXTE);
  const fin = Math.min(buf.length, decalage + FENETRE_TEXTE);
  if (debut >= fin) return '(fin du fichier)';
  return DECODEUR.decode(buf.subarray(debut, fin))
    .replace(/\r/g, '␍')
    .replace(/\n/g, '⏎')
    .replace(/\t/g, '→');
}

/** Fenêtre hexadécimale autour du décalage. */
function hex(buf, decalage) {
  const debut = Math.max(0, decalage - FENETRE_HEX);
  const fin = Math.min(buf.length, decalage + FENETRE_HEX);
  if (debut >= fin) return '(fin du fichier)';
  return [...buf.subarray(debut, fin)].map(enHex).join(' ');
}

/**
 * Décrit l'écart entre deux versions d'un même fichier.
 *
 * @param {Uint8Array} attendu octets du dist/ déjà validé
 * @param {Uint8Array} obtenu  octets du rebuild
 * @returns {string} une à deux lignes, préfixées par le chemin par l'appelant
 */
export function decrireDifference(attendu, obtenu) {
  // Même doctrine que verdictSurLesEcarts : un appelant qui ne passe pas des
  // octets est un défaut de programmation. Le dire vaut mieux qu'une trace de
  // pile au milieu d'un rapport de reproductibilité, où on la lirait comme un
  // symptôme du build plutôt que comme un bug de ce script.
  const octets = (v) => ArrayBuffer.isView(v) && typeof v.subarray === 'function';
  if (!octets(attendu) || !octets(obtenu)) {
    return 'Comparaison impossible : decrireDifference attend deux tampons d’octets.';
  }

  const tailles =
    attendu.length === obtenu.length
      ? `${attendu.length} o de part et d’autre`
      : `${attendu.length} o attendus, ${obtenu.length} o obtenus`;

  const decalage = premierEcart(attendu, obtenu);

  // L'appelant n'appelle que sur empreintes SHA-256 divergentes : arriver ici
  // avec des octets identiques signale une incohérence dans la comparaison
  // elle-même. L'avouer plutôt que rendre une phrase qui suggère un écart.
  if (decalage === -1) {
    return `${tailles} — aucun octet ne diffère, alors que les empreintes divergent : incohérence dans la comparaison.`;
  }

  // L'un s'arrête là où l'autre continue : il n'y a pas deux octets à opposer.
  if (decalage === Math.min(attendu.length, obtenu.length)) {
    const cote = attendu.length < obtenu.length ? 'dist/' : 'le rebuild';
    return `${tailles} — identiques jusqu’à l’octet ${decalage}, où ${cote} s’arrête.`;
  }

  if (estTextuel(attendu, obtenu)) {
    return (
      `${tailles} — premier écart ${position(attendu, decalage)} (octet ${decalage})\n` +
      `      attendu : « ${fragment(attendu, decalage)} »\n` +
      `      obtenu  : « ${fragment(obtenu, decalage)} »`
    );
  }

  return (
    `${tailles} — premier écart à l’octet ${decalage} (0x${decalage.toString(16)}) : ` +
    `0x${enHex(attendu[decalage])} attendu, 0x${enHex(obtenu[decalage])} obtenu\n` +
    `      attendu : ${hex(attendu, decalage)}\n` +
    `      obtenu  : ${hex(obtenu, decalage)}`
  );
}

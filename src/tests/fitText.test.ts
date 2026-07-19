import { describe, it, expect } from 'vitest';
import { fitFactorFor, cssFitFactor, LONGUEUR_PLEINE_TAILLE, BORNE_DOMINATION } from '../utils/fitText';

describe('fitFactorFor — propriétés de la loi', () => {
  it('laisse un message court à pleine taille', () => {
    expect(fitFactorFor('Paix')).toBe(1);
    expect(fitFactorFor('Jésus aime')).toBe(1);
  });

  it('ne grossit JAMAIS un message, même vide', () => {
    // Un facteur > 1 ferait déborder un panneau de trois mots : le plafond est
    // structurel, pas cosmétique.
    expect(fitFactorFor('')).toBe(1);
    expect(fitFactorFor('a')).toBe(1);
  });

  it('bascule exactement au seuil, pas un caractère avant', () => {
    expect(fitFactorFor('a'.repeat(LONGUEUR_PLEINE_TAILLE))).toBe(1);
    expect(fitFactorFor('a'.repeat(LONGUEUR_PLEINE_TAILLE + 1))).toBeLessThan(1);
  });

  it('décroît sans jamais remonter quand le message s’allonge', () => {
    let precedent = 1;
    for (let n = 1; n <= 400; n += 7) {
      const f = fitFactorFor('a'.repeat(n));
      expect(f).toBeLessThanOrEqual(precedent);
      expect(f).toBeGreaterThan(0);
      precedent = f;
    }
  });

  it('compte les points de code, pas les unités UTF-16', () => {
    // 30 emoji = 30 caractères perçus, mais 60 unités UTF-16. Compter les
    // unités réduirait la police de moitié sans raison visible.
    const emoji = '🕊️'.repeat(30);
    expect([...emoji].length).toBeLessThan(emoji.length);
    expect(fitFactorFor('🙏'.repeat(20))).toBe(1); // 20 points de code ≤ 40
  });

  it('sérialise en chaîne CSS stable et déterministe', () => {
    // Une représentation de longueur variable suffirait à faire diverger deux
    // builds — le CID IPFS en dépend.
    expect(cssFitFactor('Paix')).toBe('1.000');
    expect(cssFitFactor('a'.repeat(178))).toBe('0.440');
    expect(cssFitFactor('a'.repeat(178))).toBe(cssFitFactor('a'.repeat(178)));
    expect(cssFitFactor('a'.repeat(999))).toMatch(/^\d\.\d{3}$/);
  });

  it('ne produit qu’un jeu FINI de tailles — c’est tout l’intérêt des paliers', () => {
    // La raison d'être de la loi par paliers : sur un mur de panneaux, deux
    // corps voisins mais distincts (0,71 et 0,73) se lisent comme un défaut
    // d'alignement. Un continuum en produit autant que de longueurs ; ce test
    // échouerait immédiatement si quelqu'un revenait à une loi continue.
    // La borne du parcours dépasse le dernier palier À DESSEIN : s'arrêter à
    // 1200 ne verrait jamais le plancher et compterait 8 valeurs au lieu de 9.
    // Un test qui ne balaie pas la traîne laisserait passer un plancher devenu
    // continu — exactement le genre de trou qu'on ferme ici.
    const valeurs = new Set<number>();
    for (let n = 1; n <= 2000; n++) valeurs.add(fitFactorFor('a'.repeat(n)));
    expect(valeurs.size).toBe(9); // 1 + 7 paliers + plancher
    expect(valeurs.has(1)).toBe(true);
  });

  it('réduit au moins autant que l’ancienne loi en √, jusqu’à BORNE_DOMINATION', () => {
    // Propriété de construction du tableau : chaque palier vaut au plus
    // √(40 / borne_haute). C'est ce qui garantit que les six écrans testés plus
    // bas ne peuvent pas se remettre à couper — sans quoi le changement de loi
    // serait une régression silencieuse de mise en page.
    for (let n = LONGUEUR_PLEINE_TAILLE + 1; n <= BORNE_DOMINATION; n++) {
      expect(fitFactorFor('a'.repeat(n))).toBeLessThanOrEqual(
        Math.sqrt(LONGUEUR_PLEINE_TAILLE / n)
      );
    }
  });

  it('cesse de dominer √ juste APRÈS la borne — le domaine est fini et connu', () => {
    // Le pendant obligatoire du test précédent. Une constante positive ne peut
    // pas dominer une fonction qui tend vers 0 : la garantie est forcément
    // bornée. Ce test épingle la borne au lieu de s'arrêter pudiquement avant.
    //
    // Sans lui, quelqu'un pourrait relever le plancher (0,10 → 0,20) et voir le
    // test ci-dessus continuer à passer en réduisant simplement sa borne — la
    // régression de mise en page reviendrait, verte. Ici, remonter le plancher
    // fait échouer la domination AVANT la borne ; la descendre fait échouer
    // celui-ci. Les deux ensemble immobilisent le couple (plancher, borne).
    expect(fitFactorFor('a'.repeat(BORNE_DOMINATION))).toBeLessThanOrEqual(
      Math.sqrt(LONGUEUR_PLEINE_TAILLE / BORNE_DOMINATION)
    );
    expect(fitFactorFor('a'.repeat(BORNE_DOMINATION + 1))).toBeGreaterThan(
      Math.sqrt(LONGUEUR_PLEINE_TAILLE / (BORNE_DOMINATION + 1))
    );
  });
});

/**
 * Régression géométrique — le défaut que ce module existe pour fermer.
 *
 * Modèle APPROCHÉ, assumé comme tel : l'avance moyenne d'un glyphe est estimée
 * à 0,55em (Inter Black, letter-spacing -0.04em, moyenne lettres/espaces). Il
 * ne prétend pas au pixel près ; il prétend détecter une régression de l'ordre
 * de grandeur — un message qui repasserait de « tient » à « coupé ». C'est
 * exactement le trou qu'aucun test ne regardait : la sortie était verte pendant
 * que 61 % du message était hors écran.
 *
 * Volontairement conservateur : glyphe large, hauteur de chrome généreuse. Un
 * test qui passe ici doit tenir en vrai avec de la marge.
 */
const AVANCE_GLYPHE = 0.55; // en em
const INTERLIGNE = 1.05; // .slide-message { line-height: 1.05 }
const PLANCHER = 32; // clamp(2rem, …)
const PLAFOND = 192; // clamp(…, 12rem)

function hauteurDuMessage(message: string, largeurVp: number, hauteurVp: number) {
  const mobile = largeurVp <= 768;
  const padH = mobile ? 24 : 32; // .live-slide { padding: 2rem 1.5rem | 4rem 2rem }
  const padV = mobile ? 32 : 64;
  const gap = mobile ? 24 : 32; // .slide-content { gap }

  const ideal = Math.min(0.11 * largeurVp, 0.22 * hauteurVp);
  const taille = Math.min(PLAFOND, Math.max(PLANCHER, ideal * fitFactorFor(message)));

  // .slide-content { max-width: 90vw } borné par la boîte de contenu du slide.
  const largeurTexte = Math.min(0.9 * largeurVp, largeurVp - 2 * padH);
  const parLigne = Math.max(1, largeurTexte / (AVANCE_GLYPHE * taille));
  const lignes = Math.ceil([...message].length / parLigne);

  // Badge, auteur, tags et les trois gouttières : ils partagent la hauteur.
  const auteur = Math.min(35.2, Math.max(19.2, 0.03 * largeurVp)) * 1.4;
  const chrome = auteur + 3 * gap + 48;

  return {
    taille,
    lignes,
    hauteurTexte: lignes * taille * INTERLIGNE,
    hauteurTotale: lignes * taille * INTERLIGNE + chrome,
    hauteurDispo: hauteurVp - 2 * padV,
  };
}

describe('géométrie /live — le message tient dans l’écran', () => {
  // 178 caractères : la longueur mesurée qui débordait de 1224 px à 1440×900.
  const LONG = 'Que la paix soit sur vous et sur tous ceux qui cherchent la lumière dans la nuit, car nul ne marche seul quand il porte en lui la promesse du matin qui vient toujours après tout.';

  const ECRANS: Array<[string, number, number]> = [
    ['mobile 360×640', 360, 640],
    ['mobile 390×844', 390, 844],
    ['tablette 768×1024', 768, 1024],
    ['bureau 1440×900', 1440, 900],
    ['ultrawide 2560×1080', 2560, 1080],
    ['4K 3840×2160', 3840, 2160],
  ];

  it('le message de référence fait bien 178 caractères', () => {
    // Si quelqu'un raccourcit la chaîne, le test deviendrait vert pour la
    // mauvaise raison. On épingle la longueur qui a servi à la mesure.
    expect([...LONG].length).toBe(178);
  });

  it.each(ECRANS)('%s : rien n’est coupé', (_nom, w, h) => {
    const g = hauteurDuMessage(LONG, w, h);
    expect(g.hauteurTotale).toBeLessThanOrEqual(g.hauteurDispo);
  });

  it.each(ECRANS)('%s : un message court garde sa pleine taille', (_nom, w, h) => {
    const court = hauteurDuMessage('Paix', w, h);
    const ideal = Math.min(PLAFOND, Math.max(PLANCHER, Math.min(0.11 * w, 0.22 * h)));
    expect(court.taille).toBeCloseTo(ideal, 5);
    expect(court.lignes).toBe(1);
  });

  it('sans le facteur, le bureau 1440×900 débordait — le test a un mordant', () => {
    // Garde-fou du garde-fou : on refait le calcul avec --fit neutralisé, tel
    // qu'il était avant ce correctif. S'il ne déborde pas, c'est que le modèle
    // ne mesure plus rien et que les assertions ci-dessus sont vides.
    const taille = Math.min(PLAFOND, Math.max(48, 0.11 * 1440)); // ancien plancher 3rem
    const parLigne = Math.min(1280, 1440 - 64) / (AVANCE_GLYPHE * taille);
    const hauteur = Math.ceil(178 / parLigne) * taille * INTERLIGNE;
    expect(hauteur).toBeGreaterThan(900 - 128);
  });
});

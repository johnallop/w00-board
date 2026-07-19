import { describe, it, expect } from 'vitest';
import {
  parseScaledFontSize,
  scaledFontSizeFor,
  renderBoardImage,
  renderFallbackImage,
  renderOgImage,
  TITRE_GENERIQUE,
  INVITATION_GENERIQUE,
} from '../utils/ogTemplate';
import { fitFactorFor } from '../utils/fitText';
import { uncoveredIn } from '../utils/glyphCoverage';
import type { OgNode } from '../utils/ogTemplate';
import type { BillboardItem, ThemeConfig, LayoutConfig } from '../types/config';

const theme: ThemeConfig = {
  backgroundColor: '#0f172a',
  textColor: '#f8fafc',
  accentColor: '#38bdf8',
  fontSize: '2.5rem',
  fontFamily: 'Inter',
};

const layout: LayoutConfig = {
  horizontalAlignment: 'center',
  verticalAlignment: 'center',
};

const board = (overrides: Partial<BillboardItem> = {}): BillboardItem => ({
  id: 'test',
  message: 'Message court',
  author: 'W00DDY',
  ...overrides,
});

/** Parcourt l'arbre Satori et collecte les nœuds satisfaisant le prédicat. */
function findNodes(node: OgNode | string, pred: (n: OgNode) => boolean, acc: OgNode[] = []): OgNode[] {
  if (typeof node === 'string') return acc;
  if (pred(node)) acc.push(node);
  const children = node.props.children;
  if (Array.isArray(children)) {
    for (const child of children) findNodes(child as OgNode | string, pred, acc);
  } else if (children && typeof children === 'object') {
    findNodes(children as OgNode, pred, acc);
  }
  return acc;
}

const h1Of = (tree: OgNode): OgNode => {
  const [h1] = findNodes(tree, (n) => n.type === 'h1');
  expect(h1).toBeDefined();
  return h1;
};

describe('parseScaledFontSize', () => {
  it('convertit les rem (2.5rem → 45 px)', () => {
    expect(parseScaledFontSize('2.5rem')).toBe(45);
  });

  it('agrandit les px pour le cadre 1200×630 (40px → 48)', () => {
    expect(parseScaledFontSize('40px')).toBe(48);
  });

  it('retombe sur 48 pour une unité inconnue', () => {
    expect(parseScaledFontSize('x-large')).toBe(48);
  });
});

describe('scaledFontSizeFor', () => {
  it('garde la taille de base jusqu’à 40 points de code', () => {
    expect(scaledFontSizeFor('A'.repeat(40), '2.5rem')).toBe(45);
  });

  it('réduit par paliers au-delà de 40 points de code', () => {
    // 90 points de code tombent dans le palier [120, 0,55] : round(45 × 0,55) = 25.
    // Valeur épinglée en dur À DESSEIN : c'est la seule assertion du fichier qui
    // fixe une taille observable. Si la loi change, il FAUT qu'un test le dise.
    const message = 'A'.repeat(90);
    expect(scaledFontSizeFor(message, '2.5rem')).toBe(25);
    expect(scaledFontSizeFor(message, '2.5rem')).toBeLessThan(45);
  });

  it('dégrade exactement comme le panneau réel — cohérence aperçu ↔ panneau', () => {
    // Le vrai invariant du module, celui que l'ancien test en √ ne vérifiait pas :
    // l'aperçu social et /live partagent la MÊME loi. Une carte OG qui dégraderait
    // gracieusement pendant que le panneau coupe mentirait sur ce que le visiteur
    // va trouver en cliquant. Ce test échoue si quelqu'un réimplémente la loi ici
    // au lieu de réutiliser fitFactorFor — y compris à l'identique aujourd'hui,
    // car les deux copies divergeraient au premier réglage.
    for (const n of [1, 40, 41, 90, 178, 400, 900]) {
      const message = 'A'.repeat(n);
      const facteur = fitFactorFor(message);
      const attendu = facteur === 1 ? 45 : Math.max(24, Math.round(45 * facteur));
      expect(scaledFontSizeFor(message, '2.5rem')).toBe(attendu);
    }
  });

  it('ne descend jamais sous le plancher de 24 px', () => {
    expect(scaledFontSizeFor('A'.repeat(1000), '2.5rem')).toBe(24);
  });

  it('compte les emoji comme un seul point de code (pas les unités UTF-16)', () => {
    // 40 emoji = 80 unités UTF-16 mais 40 points de code → taille de base
    expect(scaledFontSizeFor('🔥'.repeat(40), '2.5rem')).toBe(45);
    expect(scaledFontSizeFor('🔥'.repeat(41), '2.5rem')).toBeLessThan(45);
  });
});

describe('renderBoardImage — cas extrêmes de la charte', () => {
  it.each([
    ['message long', 'Ceci est un message extrêmement long destiné à vérifier que la carte OG reste lisible même quand le texte déborde largement du cadre habituel.'],
    ['emoji', '🔥✨ JESUS T’AIME ✨🔥 💙💜'],
    ['accents français', 'Où étés-vous ? Ça ira — cœur, naïveté, Noël !'],
    ['RTL (arabe)', 'السلام عليكم ورحمة الله'],
    ['CJK (chinois)', '你好世界，和平与爱永存'],
  ])('transmet le texte intact au h1 : %s', (_label, message) => {
    const tree = renderBoardImage(board({ message }), theme, layout);
    expect(h1Of(tree).props.children).toBe(message);
  });

  it('réduit la police d’un message long mais garde la base pour un court', () => {
    const short = renderBoardImage(board({ message: 'Court' }), theme, layout);
    expect(h1Of(short).props.style?.fontSize).toBe('45px');

    const longMessage = 'Ceci est un message vraiment très long qui dépasse largement les quarante points de code autorisés.';
    const long = renderBoardImage(board({ message: longMessage }), theme, layout);
    expect(h1Of(long).props.style?.fontSize).toBe(`${scaledFontSizeFor(longMessage, theme.fontSize)}px`);
    expect(h1Of(long).props.style?.fontSize).not.toBe('45px');
  });

  it('applique la couleur d’accent du panneau (surcharge du thème)', () => {
    const tree = renderBoardImage(board({ accentColor: '#a78bfa' }), theme, layout);
    const accented = findNodes(
      tree,
      (n) => n.props.style?.backgroundColor === '#a78bfa' || n.props.style?.color === '#a78bfa'
    );
    // Le point du badge (backgroundColor) et le nom d'auteur (color)
    expect(accented.length).toBe(2);
  });

  it('retombe sur l’accent du thème quand le panneau n’en définit pas', () => {
    const tree = renderBoardImage(board(), theme, layout);
    const accented = findNodes(
      tree,
      (n) => n.props.style?.backgroundColor === '#38bdf8' || n.props.style?.color === '#38bdf8'
    );
    expect(accented.length).toBe(2);
  });

  it('affiche l’auteur du panneau dans le pied de carte', () => {
    const tree = renderBoardImage(board({ author: 'Ünicode Aùteur 测试' }), theme, layout);
    const [span] = findNodes(tree, (n) => n.props.children === 'Ünicode Aùteur 测试');
    expect(span).toBeDefined();
    expect(span.type).toBe('span');
  });
});

/** Les enfants de la carte : pastille + titre, plus filet + signature s'il y en a une. */
function enfantsDeLaCarte(tree: OgNode): Array<OgNode | string> {
  const [carte] = findNodes(tree, (n) => n.props.style?.borderRadius === '24px');
  expect(carte).toBeDefined();
  return carte.props.children as Array<OgNode | string>;
}

/** Tout le texte que la carte va réellement demander à la police de dessiner. */
function textesRendus(node: OgNode | string, acc: string[] = []): string[] {
  if (typeof node === 'string') {
    acc.push(node);
    return acc;
  }
  const children = node.props.children;
  if (typeof children === 'string') acc.push(children);
  else if (Array.isArray(children)) for (const c of children) textesRendus(c as OgNode | string, acc);
  else if (children && typeof children === 'object') textesRendus(children as OgNode, acc);
  return acc;
}

describe('renderOgImage — aiguillage police', () => {
  it('la carte générique est elle-même entièrement dessinable', () => {
    // Le repli existe pour supprimer les carrés. S'il en contenait lui-même, il
    // reproduirait le défaut qu'il corrige — d'où cette garde en tête de bloc.
    expect(uncoveredIn(TITRE_GENERIQUE)).toEqual([]);
    expect(uncoveredIn(INVITATION_GENERIQUE)).toEqual([]);
  });

  it('ne touche à RIEN quand tout est couvert — stabilité du CID', () => {
    // L'assertion qui remplace le court-circuit d'identité absent de
    // renderOgImage : les deux panneaux de config.json sont intégralement
    // couverts, donc l'aiguillage doit produire un arbre profondément égal à
    // celui d'avant. S'il en diffère d'un octet, l'image OG change, donc le CID
    // IPFS, donc le nom IPNS déjà diffusé.
    for (const message of ['Message court', 'JESUS T’AIME', 'LA PAIX SOIT AVEC VOUS', 'Ça ira — cœur, naïveté']) {
      const panneau = board({ message });
      expect(renderOgImage(panneau, theme, layout)).toEqual(renderBoardImage(panneau, theme, layout));
    }
  });

  it.each([
    ['RTL (arabe)', 'السلام عليكم ورحمة الله'],
    ['CJK (chinois)', '你好世界，和平与爱永存'],
    ['emoji seuls', '🔥✨💙💜🔥✨'],
  ])('bascule sur la carte générique quand il ne reste rien : %s', (_label, message) => {
    const tree = renderOgImage(board({ message }), theme, layout);
    expect(h1Of(tree).props.children).toBe(TITRE_GENERIQUE);
    expect(tree).toEqual(renderFallbackImage(board({ message }), theme, layout));
  });

  it('conserve le message quand seuls des emoji sont hors police', () => {
    // Un emoji dans une phrase française n'est pas un changement de script :
    // basculer sur la carte générique perdrait un texte que la police dessine.
    const tree = renderOgImage(board({ message: '🔥✨ JESUS T’AIME ✨🔥 💙💜' }), theme, layout);
    expect(h1Of(tree).props.children).toBe('JESUS T’AIME');
  });

  it('la carte générique n’affiche ni auteur ni filet, mais l’invitation', () => {
    const tree = renderOgImage(board({ message: '你好世界，和平与爱永存' }), theme, layout);
    expect(textesRendus(tree)).toContain(INVITATION_GENERIQUE);
    expect(findNodes(tree, (n) => n.props.children === 'W00DDY')).toHaveLength(0);
  });

  it('supprime la signature ENTIÈRE quand l’auteur n’est pas dessinable', () => {
    // « 李明 » ne laisse aucun caractère. Mieux vaut pas de ligne de signature
    // qu'une ligne à moitié écrite — et le filet part avec elle, sinon il
    // resterait un trait qui ne mène nulle part.
    const tree = renderOgImage(board({ author: '李明' }), theme, layout);
    expect(enfantsDeLaCarte(tree)).toHaveLength(2); // pastille + titre, rien d'autre
    expect(h1Of(tree).props.style?.margin).toBe('0');

    const avecAuteur = renderOgImage(board(), theme, layout);
    expect(enfantsDeLaCarte(avecAuteur)).toHaveLength(4); // + filet + signature
  });

  it('GARANTIE DURE : aucun point de code hors police dans l’arbre produit', () => {
    const messages = [
      'Message court',
      'JESUS T’AIME',
      'Ceci est un message extrêmement long destiné à vérifier que la carte OG reste lisible même quand le texte déborde largement du cadre habituel.',
      '🔥✨ JESUS T’AIME ✨🔥 💙💜',
      'Où étés-vous ? Ça ira — cœur, naïveté, Noël !',
      'السلام عليكم ورحمة الله',
      '你好世界，和平与爱永存',
      '🔥',
      'مرحبا 🔥 世界',
      'Ligne un\nligne deux\tfin',
    ];
    for (const message of messages) {
      for (const author of ['W00DDY', '李明', '', 'Ünicode Aùteur 测试']) {
        const tree = renderOgImage(board({ message, author }), theme, layout);
        for (const texte of textesRendus(tree)) {
          expect(uncoveredIn(texte), `« ${texte} » (message: ${message})`).toEqual([]);
        }
      }
    }
  });
});

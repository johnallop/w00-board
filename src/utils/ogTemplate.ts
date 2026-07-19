import type { BillboardItem, ThemeConfig, LayoutConfig } from '../types/config';
import { resolveAlignment } from './alignment';
import { fitFactorFor } from './fitText';
import { renderableText } from './glyphCoverage';

/** Nœud de l'arbre Satori (sous-ensemble React-like accepté par satori()). */
export interface OgNode {
  type: string;
  props: {
    style?: Record<string, string | number>;
    children?: OgNode | Array<OgNode | string> | string;
    [key: string]: unknown;
  };
}

export function parseScaledFontSize(fontSize: string): number {
  if (fontSize.includes('rem')) return Math.round(parseFloat(fontSize) * 18);
  if (fontSize.includes('px')) return Math.round(parseFloat(fontSize) * 1.2);
  return 48;
}

/**
 * Taille de police adaptée à la longueur du message : un message long est
 * réduit progressivement pour rester lisible dans le cadre 1200×630, avec un
 * plancher de 24 px.
 *
 * La loi de décroissance vit désormais dans utils/fitText.ts, partagée avec le
 * panneau plein écran (/live). Elle était ici seule : l'aperçu social dégradait
 * gracieusement un message long pendant que le panneau réel le coupait, à
 * partir du même texte. Une seule loi, deux consommateurs — un changement de
 * loi déplace les deux ensemble, ce qui est précisément le but.
 */
export function scaledFontSizeFor(message: string, themeFontSize: string): number {
  const base = parseScaledFontSize(themeFontSize);
  const facteur = fitFactorFor(message);
  // Plancher réservé aux messages réduits : un thème dont la taille de base
  // serait déjà sous 24 px reste respecté tel quel, comme avant l'extraction.
  if (facteur === 1) return base;
  return Math.max(24, Math.round(base * facteur));
}

/**
 * Texte de la carte générique, affichée quand la police ne sait rien dessiner
 * du message (voir `renderOgImage`).
 *
 * Formulé pour être vrai des DEUX cas qui y mènent : une écriture non latine
 * (arabe, CJK) et un message fait presque uniquement d'emoji. « Écriture non
 * latine » aurait été faux du second ; « caractères non pris en charge » aurait
 * décrit la limite de l'outil au lieu du contenu. L'aperçu social n'a pas à
 * s'excuser, il a à donner envie d'ouvrir le panneau.
 *
 * CONTRAINTE — ce texte traverse exactement la même police que le message qu'il
 * remplace. S'il contenait un point de code hors cmap, la carte de secours
 * afficherait elle-même des carrés : le repli reproduirait le défaut qu'il
 * existe pour corriger. `ogTemplate.test.ts` l'interdit explicitement.
 */
export const TITRE_GENERIQUE = 'Un message vous attend';
export const INVITATION_GENERIQUE = 'Ouvrez le panneau pour le lire';

/** Ce que la carte OG affiche, indépendamment de la provenance du texte. */
interface ContenuCarte {
  accent: string;
  titre: string;
  tailleTitre: number;
  /** Ligne de pied ; `null` retire AUSSI le séparateur qui la surmonte. */
  pied: Array<OgNode | string> | null;
}

/**
 * Le châssis commun aux deux cartes — panneau réel et carte générique.
 *
 * Extrait plutôt que dupliqué pour une raison de produit, pas de facture : une
 * carte de secours qui ne ressemble pas à la carte normale se lit comme une
 * page d'erreur. Même fond, même cadre, même pastille d'accent : le lecteur
 * doit reconnaître W00-BOARD, pas un incident.
 */
function carteOg(theme: ThemeConfig, layout: LayoutConfig, contenu: ContenuCarte): OgNode {
  const { justifyValue, alignValue, textAlignValue } = resolveAlignment(layout);
  const { accent, titre, tailleTitre, pied } = contenu;

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justifyValue,
        alignItems: alignValue,
        backgroundColor: theme.backgroundColor,
        width: '100%',
        height: '100%',
        padding: '80px',
        boxSizing: 'border-box',
        fontFamily: 'Inter',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '24px',
              padding: '60px',
              maxWidth: '900px',
              width: '100%',
              boxSizing: 'border-box',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '30px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: accent,
                        },
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: {
                          fontSize: '14px',
                          fontWeight: 700,
                          color: theme.textColor,
                          opacity: 0.8,
                          letterSpacing: '1px',
                          textTransform: 'uppercase',
                        },
                        children: 'Réseau Actif / Live',
                      },
                    },
                  ],
                },
              },
              {
                type: 'h1',
                props: {
                  style: {
                    fontSize: `${tailleTitre}px`,
                    fontWeight: 800,
                    color: theme.textColor,
                    lineHeight: 1.3,
                    // Sans pied, la marge basse ne sépare plus rien : elle
                    // ajouterait 30 px de vide contre les 60 px de padding.
                    margin: pied === null ? '0' : '0 0 30px 0',
                    textAlign: textAlignValue,
                  },
                  children: titre,
                },
              },
              // Le filet et la signature vont ENSEMBLE : un filet sans rien en
              // dessous se lit comme une ligne qui ne mène nulle part.
              ...(pied === null
                ? []
                : [
                    {
                      type: 'div',
                      props: {
                        style: {
                          height: '1px',
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          width: '100%',
                          marginBottom: '20px',
                        },
                      },
                    },
                    {
                      type: 'p',
                      props: {
                        style: {
                          fontSize: '20px',
                          color: theme.textColor,
                          opacity: 0.6,
                          margin: 0,
                          display: 'flex',
                        },
                        children: pied,
                      },
                    },
                  ]),
            ],
          },
        },
      ],
    },
  };
}

/**
 * La carte du panneau réel — le chemin nominal, inchangé.
 *
 * `board.author` est transmis TEL QUEL ; `.trim()` ne sert qu'au test de
 * vacuité. Normaliser la valeur transmise déplacerait les octets produits pour
 * un auteur bordé d'espaces, donc le CID IPFS, sans qu'aucun défaut ne le
 * justifie.
 */
export function renderBoardImage(
  board: BillboardItem,
  theme: ThemeConfig,
  layout: LayoutConfig
): OgNode {
  const accent = board.accentColor ?? theme.accentColor;
  const aSignature = board.author.trim().length > 0;

  return carteOg(theme, layout, {
    accent,
    titre: board.message,
    tailleTitre: scaledFontSizeFor(board.message, theme.fontSize),
    pied: aSignature
      ? [
          'Signé par : ',
          {
            type: 'span',
            props: {
              style: { color: accent, fontWeight: 700, marginLeft: '6px' },
              children: board.author,
            },
          },
        ]
      : null,
  });
}

/**
 * La carte générique — même châssis, message remplacé.
 *
 * Elle n'affiche AUCUN auteur : une carte qui admet déjà ne pas pouvoir montrer
 * le message ne gagne rien à montrer un nom d'auteur amputé de ses caractères
 * non latins. Le pied porte l'invitation, qui est l'action utile.
 */
export function renderFallbackImage(
  board: BillboardItem,
  theme: ThemeConfig,
  layout: LayoutConfig
): OgNode {
  return carteOg(theme, layout, {
    accent: board.accentColor ?? theme.accentColor,
    titre: TITRE_GENERIQUE,
    tailleTitre: scaledFontSizeFor(TITRE_GENERIQUE, theme.fontSize),
    pied: [INVITATION_GENERIQUE],
  });
}

/**
 * L'aiguillage : la seule entrée que les routes OG doivent appeler.
 *
 * Garantie dure — l'image produite ne contient JAMAIS de carré `.notdef`, quel
 * que soit le contenu de config.json.
 *
 * PAS DE COURT-CIRCUIT D'IDENTITÉ ici, volontairement. Écrire
 * `if (message === board.message) return renderBoardImage(board, …)` semble
 * économiser un objet, mais crée deux chemins qu'il faudrait maintenir
 * équivalents à jamais. `{ ...board, message, author }` avec des valeurs
 * identiques produit exactement le même arbre ; la stabilité du CID pour les
 * panneaux entièrement couverts est épinglée par un test d'égalité profonde
 * dans ogTemplate.test.ts, pas par une branche.
 *
 * L'auteur passe par la MÊME règle que le message — une seule règle, un seul
 * point de retour en arrière. Conséquence assumée : « 李明 » ne laisse rien et
 * la ligne de signature disparaît, plutôt que de rester à moitié écrite. Le
 * résidu latin d'un nom mixte peut différer du nom voulu ; le risque est borné
 * par les seuils de `renderableText` (50 % conservés, 3 caractères minimum).
 */
export function renderOgImage(
  board: BillboardItem,
  theme: ThemeConfig,
  layout: LayoutConfig
): OgNode {
  const message = renderableText(board.message);
  if (message === null) return renderFallbackImage(board, theme, layout);

  const author = renderableText(board.author) ?? '';
  return renderBoardImage({ ...board, message, author }, theme, layout);
}

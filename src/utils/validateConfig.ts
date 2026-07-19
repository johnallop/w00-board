import type { BillboardConfig } from '../types/config';

const VALID_H = ['left', 'center', 'right'] as const;
const VALID_V = ['top', 'center', 'bottom'] as const;

/*
 * Règle de conception de ce module : ne jamais convertir « je ne sais pas lire
 * cette valeur » en « cette valeur est correcte ».
 *
 * Les versions précédentes le faisaient à trois endroits — contraste renvoyant
 * 5.0 pour toute couleur non hexadécimale, luminance renvoyant 0.5 pour toute
 * couleur illisible, fontFamily absent du contrôle d'injection. Chacun rendait
 * la porte *plus* permissive au moment exact où elle en savait le moins, et le
 * message d'erreur affichait un ratio fabriqué comme s'il avait été mesuré.
 * Une valeur incomprise est désormais une erreur dure, avec la marche à suivre.
 */

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function isSafeColor(color: string): boolean {
  // Bloque les injections CSS et les comportements malveillants (url, expression)
  const unsafePattern = /[;{}]|url\s*\(|expression\s*\(/i;
  return !unsafePattern.test(color);
}

/*
 * `fontFamily` atterrit tel quel dans un attribut `style` (index.astro:15,
 * live.astro:44, b/[id].astro:56, verifier.astro:40). Astro échappe les
 * guillemets, ce qui interdit de sortir de l'attribut — mais pas d'ajouter une
 * déclaration à l'intérieur : « Inter; background-image: url(https://…) »
 * suffit à faire émettre une requête distante par chaque visiteur. La liste
 * blanche couvre les piles de polices réelles (Inter, "Segoe UI", system-ui,
 * sans-serif) et rien d'autre : ni `;`, ni parenthèse, ni saut de ligne.
 */
const SAFE_FONT_FAMILY = /^[A-Za-z0-9 ,._'"-]{1,100}$/;

/*
 * `fontSize` n'a qu'un seul consommateur : parseScaledFontSize (ogTemplate.ts),
 * qui ne comprend que `rem` et `px` et retombe sur 48 pour tout le reste. Une
 * unité non listée serait donc acceptée par la config puis silencieusement
 * ignorée par l'image OG — un réglage qui ment. Et « abc rem » produisait
 * parseFloat → NaN → `fontSize: "NaNpx"` transmis à satori.
 */
const SAFE_FONT_SIZE = /^\d{1,4}(\.\d{1,3})?(rem|px)$/;

/** Décompose #rgb, #rgba, #rrggbb, #rrggbbaa. `null` si la forme est autre. */
function parseHexColor(value: string): Rgba | null {
  const m = value.trim().match(/^#([0-9a-f]+)$/i);
  if (!m) return null;
  const d = m[1];
  const octet = (s: string) => parseInt(s.length === 1 ? s + s : s, 16);

  if (d.length === 3 || d.length === 4) {
    return { r: octet(d[0]), g: octet(d[1]), b: octet(d[2]), a: d.length === 4 ? octet(d[3]) : 255 };
  }
  if (d.length === 6 || d.length === 8) {
    return {
      r: octet(d.slice(0, 2)),
      g: octet(d.slice(2, 4)),
      b: octet(d.slice(4, 6)),
      a: d.length === 8 ? octet(d.slice(6, 8)) : 255,
    };
  }
  return null; // 1, 2, 5, 7 chiffres ou plus de 8 : forme inexistante en CSS
}

/**
 * Couleur exploitable pour un calcul de contraste, ou erreur explicite.
 *
 * Refuser un nom CSS (`white`) ou `rgb(…)` est une restriction assumée : la
 * seule alternative honnête serait d'embarquer la table des 148 noms CSS et un
 * analyseur de fonctions couleur, pour un dépôt dont les quatre couleurs sont
 * hexadécimales. Le compromis précédent — laisser passer sans mesurer — était
 * le seul à ne protéger de rien.
 */
function assertCouleurMesurable(valeur: string, chemin: string): Rgba {
  const rgb = parseHexColor(valeur);
  if (!rgb) {
    throw new Error(
      `config.json : "${chemin}" (${valeur}) doit être une couleur hexadécimale (#rgb, #rgba, #rrggbb ou #rrggbbaa). Un nom CSS ou une fonction rgb() n'est pas mesurable par le contrôle de contraste WCAG, qui laisserait alors passer la valeur sans l'avoir vérifiée.`
    );
  }
  if (rgb.a !== 255) {
    throw new Error(
      `config.json : "${chemin}" (${valeur}) est semi-transparente (alpha ${rgb.a}/255). Le contraste réel dépend de ce qui se trouve derrière, que le build ne connaît pas : indiquer la couleur composée finale, opaque.`
    );
  }
  return rgb;
}

function getRelativeLuminance(rgb: Rgba): number {
  const a = [rgb.r, rgb.g, rgb.b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/** Ratio WCAG 2.2 entre deux couleurs déjà validées comme mesurables. */
function getContrastRatio(color1: Rgba, color2: Rgba): number {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (brightest + 0.05) / (darkest + 0.05);
}

export function validateConfig(config: unknown): asserts config is BillboardConfig {
  if (typeof config !== 'object' || config === null) {
    throw new Error('config.json : doit être un objet JSON valide');
  }

  const c = config as Record<string, unknown>;

  if (!Array.isArray(c.billboards) || c.billboards.length === 0) {
    throw new Error('config.json : "billboards" doit être un tableau non vide');
  }

  /*
   * Le thème est validé AVANT la boucle des panneaux, alors qu'il l'était après.
   * Chaque panneau mesure son accent contre `theme.backgroundColor` : tant que
   * le fond n'était pas validé, la boucle devait le contrôler elle-même au
   * passage (`isSafeColor(themeBg)` ligne 145) et sauter la mesure quand elle
   * échouait — un fond invalide désactivait donc le contrôle de contraste de
   * *tous* les panneaux, en silence. Valider le fond d'abord donne à la boucle
   * une référence déjà mesurable et supprime la branche qui sautait.
   *
   * L'ordre relatif billboards/theme des messages d'erreur change en
   * conséquence, mais le contrôle « billboards est un tableau non vide » reste
   * en tête : c'est le seul dont un thème absent masquerait le diagnostic.
   */
  if (typeof c.theme !== 'object' || c.theme === null) {
    throw new Error('config.json : "theme" doit être un objet');
  }
  const theme = c.theme as Record<string, unknown>;
  for (const key of ['backgroundColor', 'textColor', 'accentColor', 'fontSize', 'fontFamily'] as const) {
    if (typeof theme[key] !== 'string' || (theme[key] as string).trim() === '') {
      throw new Error(`config.json : "theme.${key}" doit être une chaîne non vide`);
    }
    if (['backgroundColor', 'textColor', 'accentColor'].includes(key) && !isSafeColor(theme[key] as string)) {
      throw new Error(`config.json : "theme.${key}" contient des caractères d'injection CSS non autorisés`);
    }
  }

  if (!SAFE_FONT_FAMILY.test(theme.fontFamily as string)) {
    throw new Error(
      `config.json : "theme.fontFamily" (${theme.fontFamily}) contient des caractères interdits. Cette valeur est insérée dans un attribut style ; seuls lettres, chiffres, espaces, virgules, points, tirets, underscores et guillemets sont admis (ex. « Inter, "Segoe UI", sans-serif »), 100 caractères au plus.`
    );
  }
  if (!SAFE_FONT_SIZE.test(theme.fontSize as string)) {
    throw new Error(
      `config.json : "theme.fontSize" (${theme.fontSize}) doit être un nombre suivi de rem ou px (ex. 2.5rem, 48px). Ce sont les deux seules unités que l'image OpenGraph sait convertir ; toute autre serait acceptée ici puis remplacée par 48 px à la génération, sans avertissement.`
    );
  }

  const bg = theme.backgroundColor as string;
  const textColorValue = theme.textColor as string;
  const accentColorValue = theme.accentColor as string;

  const bgRgb = assertCouleurMesurable(bg, 'theme.backgroundColor');
  const textRgb = assertCouleurMesurable(textColorValue, 'theme.textColor');
  const accentRgb = assertCouleurMesurable(accentColorValue, 'theme.accentColor');

  const textRatio = getContrastRatio(textRgb, bgRgb);
  if (textRatio < 4.5) {
    throw new Error(`config.json : "theme.textColor" (${textColorValue}) a un contraste insuffisant de ${textRatio.toFixed(2)}:1 avec la couleur de fond (${bg}), le minimum WCAG 2.2 AA est de 4.5:1`);
  }

  const accentRatio = getContrastRatio(accentRgb, bgRgb);
  if (accentRatio < 4.5) {
    throw new Error(`config.json : "theme.accentColor" (${accentColorValue}) a un contraste insuffisant de ${accentRatio.toFixed(2)}:1 avec la couleur de fond (${bg}), le minimum WCAG 2.2 AA est de 4.5:1`);
  }

  c.billboards.forEach((board: unknown, i: number) => {
    if (typeof board !== 'object' || board === null) {
      throw new Error(`config.json : "billboards[${i}]" doit être un objet`);
    }
    const b = board as Record<string, unknown>;
    if (typeof b.id !== 'string' || !/^[a-z0-9-_]+$/i.test(b.id)) {
      throw new Error(`config.json : "billboards[${i}].id" doit être un identifiant URL-safe unique (uniquement lettres, chiffres, tirets et underscores)`);
    }
    if (typeof b.message !== 'string' || b.message.trim() === '') {
      throw new Error(`config.json : "billboards[${i}].message" doit être une chaîne non vide`);
    }
    if (typeof b.author !== 'string' || b.author.trim() === '') {
      throw new Error(`config.json : "billboards[${i}].author" doit être une chaîne non vide`);
    }
    if (b.tags !== undefined && (!Array.isArray(b.tags) || !b.tags.every((t: unknown) => typeof t === 'string'))) {
      throw new Error(`config.json : "billboards[${i}].tags" doit être un tableau de chaînes`);
    }
    if (b.accentColor !== undefined) {
      if (typeof b.accentColor !== 'string' || !isSafeColor(b.accentColor)) {
        throw new Error(`config.json : "billboards[${i}].accentColor" doit être une couleur CSS valide et sécurisée`);
      }
      // Nommé `panneauRgb` et non `accentRgb` : `accentRgb` existe déjà dans la
      // portée parente (l'accent du thème). Le masquer donnerait deux variables
      // homonymes pour deux couleurs différentes à quinze lignes d'écart.
      const panneauRgb = assertCouleurMesurable(b.accentColor, `billboards[${i}].accentColor`);
      const ratio = getContrastRatio(panneauRgb, bgRgb);
      if (ratio < 4.5) {
        throw new Error(`config.json : "billboards[${i}].accentColor" (${b.accentColor}) a un contraste insuffisant de ${ratio.toFixed(2)}:1 avec la couleur de fond (${bg}), le minimum WCAG 2.2 AA est de 4.5:1`);
      }
    }
    if (b.date !== undefined) {
      if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/.test(b.date) || Number.isNaN(Date.parse(b.date))) {
        throw new Error(`config.json : "billboards[${i}].date" doit être une date ISO 8601 valide (ex. 2026-06-23 ou 2026-06-23T15:38:09Z)`);
      }
    }
  });

  // Vérification d'unicité des IDs — deux panneaux avec le même ID
  // provoqueraient une collision de route silencieuse sur /b/[id].
  const ids = (c.billboards as Array<Record<string, unknown>>).map((b) => b.id as string);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`config.json : ID dupliqué "${id}" détecté dans billboards[]. Chaque panneau doit avoir un identifiant unique.`);
    }
    seen.add(id);
  }

  if (typeof c.layout !== 'object' || c.layout === null) {
    throw new Error('config.json : "layout" doit être un objet');
  }
  const layout = c.layout as Record<string, unknown>;
  if (!VALID_H.includes(layout.horizontalAlignment as (typeof VALID_H)[number])) {
    throw new Error(`config.json : "layout.horizontalAlignment" doit être parmi : ${VALID_H.join(', ')}`);
  }
  if (!VALID_V.includes(layout.verticalAlignment as (typeof VALID_V)[number])) {
    throw new Error(`config.json : "layout.verticalAlignment" doit être parmi : ${VALID_V.join(', ')}`);
  }
}

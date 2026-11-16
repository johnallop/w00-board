import type { BillboardConfig } from '../types/config';
import { RESEAUX_SOCIAUX, MAX_PROFILS_SOCIAUX, MAX_LIBELLE_PROFIL, estReseauSocial } from './social';
import { debutMs, finMs } from '../../scripts/lib/programmation.mjs';

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

/** Teinte des textes secondaires écrite en dur dans les pages, et son opacité la plus faible. */
const TEINTE_SECONDAIRE: Rgba = { r: 248, g: 250, b: 252, a: 255 };
const ALPHA_SECONDAIRE_MIN = 0.5;

/** Couleur perçue d'une teinte d'opacité `alpha` posée sur un fond opaque. */
function composerSurFond(teinte: Rgba, alpha: number, fond: Rgba): Rgba {
  const canal = (t: number, f: number) => alpha * t + (1 - alpha) * f;
  return { r: canal(teinte.r, fond.r), g: canal(teinte.g, fond.g), b: canal(teinte.b, fond.b), a: 255 };
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

  /*
   * Les textes secondaires des pages (date, légendes, compteurs, tags) ne
   * suivent pas `theme.textColor` : ils sont écrits en blanc translucide,
   * l'opacité la plus faible étant 0,5 (.poster-date, .qrcode-legend de
   * b/[id].astro ; tags et compteurs du mur et de /live). Ils supposent donc
   * un fond sombre. Sans ce contrôle, un
   * thème clair (#ffffff / #000000) passait la validation et rendait ces
   * textes blanc sur blanc. On mesure l'hypothèse elle-même : la teinte
   * composée sur le fond configuré doit atteindre 4,5:1.
   */
  const secondaire = composerSurFond(TEINTE_SECONDAIRE, ALPHA_SECONDAIRE_MIN, bgRgb);
  const secondaireRatio = getContrastRatio(secondaire, bgRgb);
  if (secondaireRatio < 4.5) {
    throw new Error(
      `config.json : "theme.backgroundColor" (${bg}) est trop clair pour les textes secondaires des pages, écrits en blanc à ${ALPHA_SECONDAIRE_MIN * 100} % d'opacité : ${secondaireRatio.toFixed(2)}:1, le minimum WCAG 2.2 AA est de 4.5:1. Le site suppose un fond sombre ; un thème clair demanderait de dériver ces teintes de theme.textColor dans les pages.`
    );
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
    validerPeriode(b, i);
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

  validerProfilsSociaux(c.social);
}

/*
 * Période de diffusion facultative. Une borne illisible est une erreur dure, et
 * non « pas de borne » : un panneau dont la fin serait ignorée tournerait
 * indéfiniment sur le kiosque, sans que rien ne le signale. Les bornes sont
 * comparées telles que programmation.mjs les applique (fin d'un jour seul =
 * lendemain 00:00 UTC), pour que la validation et l'affichage ne divergent pas.
 */
function validerPeriode(b: Record<string, unknown>, i: number): void {
  for (const cle of ['startDate', 'endDate'] as const) {
    const valeur = b[cle];
    if (valeur === undefined) continue;
    if (debutMs(valeur) === null) {
      throw new Error(
        `config.json : "billboards[${i}].${cle}" (${JSON.stringify(valeur)}) doit être une date ISO 8601 valide : jour seul (2026-12-01, compris en UTC) ou date-heure AVEC fuseau (2026-12-01T08:00:00+01:00)`
      );
    }
  }
  const debut = debutMs(b.startDate);
  const fin = finMs(b.endDate);
  if (debut !== null && fin !== null && fin <= debut) {
    throw new Error(
      `config.json : "billboards[${i}]" : la période de diffusion est vide (startDate ${b.startDate} ≥ fin effective de endDate ${b.endDate}). Le panneau ne serait jamais affiché.`
    );
  }
}

/*
 * `social[]` est optionnel : une config sans comptes reste valide, et le pied
 * de page n'affiche alors rien de plus. Chaque URL finit dans un `href` et
 * dans le JSON-LD `sameAs` : seul `https:` est admis — ni `javascript:`, ni
 * `data:`, ni `http:` qu'un navigateur signalerait comme non sûr.
 */
function validerProfilsSociaux(social: unknown): void {
  if (social === undefined) return;
  if (!Array.isArray(social)) {
    throw new Error('config.json : "social" doit être un tableau de profils { network, url, label? }');
  }
  if (social.length > MAX_PROFILS_SOCIAUX) {
    throw new Error(`config.json : "social" contient ${social.length} profils, ${MAX_PROFILS_SOCIAUX} au plus`);
  }
  const urlsVues = new Set<string>();
  social.forEach((profil: unknown, i: number) => {
    const chemin = `social[${i}]`;
    if (typeof profil !== 'object' || profil === null || Array.isArray(profil)) {
      throw new Error(`config.json : "${chemin}" doit être un objet { network, url, label? }`);
    }
    const p = profil as Record<string, unknown>;
    if (!estReseauSocial(p.network)) {
      throw new Error(
        `config.json : "${chemin}.network" (${JSON.stringify(p.network)}) doit être parmi : ${RESEAUX_SOCIAUX.join(', ')}`
      );
    }
    if (typeof p.url !== 'string') {
      throw new Error(`config.json : "${chemin}.url" doit être une URL https (reçu ${JSON.stringify(p.url)})`);
    }
    let url: URL;
    try {
      url = new URL(p.url);
    } catch {
      throw new Error(`config.json : "${chemin}.url" (${p.url}) n'est pas une URL absolue valide`);
    }
    if (url.protocol !== 'https:') {
      throw new Error(`config.json : "${chemin}.url" (${p.url}) doit commencer par https:// — protocole « ${url.protocol} » refusé`);
    }
    if (urlsVues.has(url.href)) {
      throw new Error(`config.json : "${chemin}.url" (${p.url}) apparaît deux fois dans "social"`);
    }
    urlsVues.add(url.href);
    if (p.label !== undefined) {
      if (typeof p.label !== 'string' || p.label.trim() === '' || [...p.label].length > MAX_LIBELLE_PROFIL) {
        throw new Error(`config.json : "${chemin}.label" doit être un texte non vide de ${MAX_LIBELLE_PROFIL} caractères au plus`);
      }
    }
  });
}

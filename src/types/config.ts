import type { ReseauSocial } from '../utils/social';

export interface ThemeConfig {
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontSize: string;
  fontFamily: string;
}

export interface LayoutConfig {
  horizontalAlignment: 'left' | 'center' | 'right';
  verticalAlignment: 'top' | 'center' | 'bottom';
}

export interface BillboardItem {
  id: string;
  message: string;
  author: string;
  tags?: string[];
  accentColor?: string;
  /** Date de publication ISO 8601 — utilisée par les feeds, le sitemap et le JSON-LD. */
  date?: string;
  /**
   * Début de la période de diffusion (ISO 8601, inclus). Appliqué à l'affichage
   * — /live et rotation hebdomadaire —, jamais au build : voir
   * scripts/lib/programmation.mjs. Hors empreinte d'authenticité.
   */
  startDate?: string;
  /** Fin de la période de diffusion (ISO 8601 ; un jour seul couvre la journée UTC entière). */
  endDate?: string;
}

export interface SocialProfile {
  network: ReseauSocial;
  /** URL https du profil public. */
  url: string;
  /** Texte du lien (ex. « @w00ddy@mastodon.social ») — défaut : nom du réseau. */
  label?: string;
}

export interface BillboardConfig {
  billboards: BillboardItem[];
  theme: ThemeConfig;
  layout: LayoutConfig;
  /** Comptes associés au panneau : liens rel="me" du pied de page et `sameAs` JSON-LD. */
  social?: SocialProfile[];
}

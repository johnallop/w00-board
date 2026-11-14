/**
 * Comptes sociaux associés au panneau — clé optionnelle `social[]` de
 * config.json.
 *
 * Une union finie plutôt qu'une chaîne libre (charte AGENTS.md) : le libellé
 * affiché et l'ordre de présentation en dépendent, et une faute de frappe
 * (« mastodom ») doit échouer au build au lieu d'afficher un lien anonyme.
 *
 * Les réseaux ouverts et décentralisés viennent en tête de liste : c'est
 * l'ordre d'affichage dans le pied de page, cohérent avec les canaux de
 * diffusion du dépôt.
 */
export const RESEAUX_SOCIAUX = [
  'mastodon',
  'bluesky',
  'nostr',
  'matrix',
  'misskey',
  'pixelfed',
  'peertube',
  'lemmy',
  'ntfy',
  'telegram',
  'discord',
  'github',
  'youtube',
  'instagram',
  'threads',
  'tiktok',
  'linkedin',
  'facebook',
  'x',
  'website',
] as const;

export type ReseauSocial = (typeof RESEAUX_SOCIAUX)[number];

const LIBELLES: Record<ReseauSocial, string> = {
  mastodon: 'Mastodon',
  bluesky: 'Bluesky',
  nostr: 'Nostr',
  matrix: 'Matrix',
  misskey: 'Misskey',
  pixelfed: 'Pixelfed',
  peertube: 'PeerTube',
  lemmy: 'Lemmy',
  ntfy: 'ntfy',
  telegram: 'Telegram',
  discord: 'Discord',
  github: 'GitHub',
  youtube: 'YouTube',
  instagram: 'Instagram',
  threads: 'Threads',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  x: 'X',
  website: 'Site web',
};

export function libelleReseau(reseau: ReseauSocial): string {
  return LIBELLES[reseau];
}

export function estReseauSocial(valeur: unknown): valeur is ReseauSocial {
  return typeof valeur === 'string' && (RESEAUX_SOCIAUX as readonly string[]).includes(valeur);
}

/** Au-delà, le pied de page devient une liste de liens que personne ne lit. */
export const MAX_PROFILS_SOCIAUX = 12;
export const MAX_LIBELLE_PROFIL = 40;

/**
 * Mentions légales — loi n° 2004-575 du 21 juin 2004, article 1-1, I, créé par
 * l'article 48 de la loi n° 2024-449 du 21 mai 2024. L'éditeur exerce à titre
 * professionnel : son identité est publique (l'anonymat du II est réservé aux
 * éditeurs non professionnels). Défaut de publication : un an d'emprisonnement
 * et 75 000 € d'amende (article 1-2).
 *
 * Une seule source pour la page /mentions-legales/ ; un fork qui se déploie
 * ailleurs remplace ce fichier par sa propre identité.
 */

export interface Prestataire {
  nom: string;
  adresse: string;
  telephone?: string;
  /** Ce que le prestataire fait pour le site, en minuscule : inséré après un tiret. */
  role: string;
  /** Page officielle d'où viennent ces coordonnées. */
  source: string;
}

export const EDITEUR = {
  nom: 'Elie DAMEY',
  /** En minuscule : la page l'insère au milieu d'une phrase. */
  statut: 'entrepreneur individuel',
  /** Nom du projet sous lequel le site est publié (pied de page « Un projet WOODDYVIAT »). */
  projet: 'WOODDYVIAT',
  adresse: '11 boulevard Léglize, 13004 Marseille, France',
  telephone: '06 25 24 08 39',
  /** Format tel: international, pour le lien cliquable. */
  telephoneUri: 'tel:+33625240839',
  /**
   * Numéro SIREN, exigé dès que l'éditeur est immatriculé. À COMPLÉTER : tant
   * qu'il vaut null, la page ne l'affiche pas et les mentions sont incomplètes.
   */
  siren: null as string | null,
  /** Adresse redirigée par Cloudflare Email Routing (wooddyviat-site, src/lib/site.ts). */
  email: 'contact@wooddyviat.com',
} as const;

export const DIRECTEUR_PUBLICATION = 'Elie DAMEY';

/** Hébergeur au sens de l'article 1-1, I : nom, adresse ET téléphone exigés. */
export const HEBERGEUR: Prestataire = {
  nom: 'Cloudflare, Inc.',
  adresse: '101 Townsend St., San Francisco, California 94107, États-Unis',
  telephone: '+1 (650) 319-8930',
  role: 'hébergement du site (Cloudflare Pages)',
  source: 'https://www.cloudflare.com/website-terms/',
};

/**
 * Prestataires qui stockent des données traitées par l'éditeur (article 1-1, I :
 * nom et adresse). Coordonnées lues sur leurs pages officielles le 2026-11-16.
 */
export const STOCKAGE: readonly Prestataire[] = [
  {
    nom: 'Filebase, Inc.',
    adresse: '6 Liberty Square, Suite 446, Boston, MA 02109, États-Unis',
    role: 'épinglage du miroir IPFS du site',
    source: 'https://filebase.com/terms-of-service/',
  },
  {
    nom: 'GitHub, Inc.',
    adresse: '88 Colin P. Kelly Jr. St., San Francisco, CA 94107, États-Unis',
    role: 'code source et propositions de panneaux (issues publiques)',
    source:
      'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
  },
];

/**
 * Contrôle d'un SIREN : 9 chiffres et clé de Luhn. Sert à refuser une faute de
 * frappe le jour où le numéro est renseigné (src/tests/editeur.test.ts).
 */
export function estSirenValide(siren: string): boolean {
  const chiffres = siren.replace(/\s/g, '');
  if (!/^\d{9}$/.test(chiffres)) return false;
  let somme = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(chiffres[8 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    somme += n;
  }
  return somme % 10 === 0;
}

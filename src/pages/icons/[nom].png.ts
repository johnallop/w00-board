import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import rawConfig from '../../data/config.json';
import { validateConfig } from '../../utils/validateConfig';

/*
 * Icônes de l'application installable, rendues au build depuis favicon.svg.
 *
 * Le manifeste ne déclarait qu'une icône SVG en « any maskable » : iOS
 * n'utilise pas d'icône SVG, et le dessin débordait de la zone sûre maskable
 * (cercle de 40 % du côté) — le cadre était rogné en icône adaptative Android.
 * On produit donc des PNG :
 *   - icon-192 / icon-512 : l'icône telle quelle (purpose « any ») ;
 *   - maskable-512 : fond plein, dessin réduit à 60 % et centré — le coin le
 *     plus éloigné du cadre tombe à 32 % du côté depuis le centre, sous les 40 % ;
 *   - apple-touch-icon (180) : fond plein, iOS arrondit lui-même les coins.
 *
 * Une seule source (favicon.svg) : pas de PNG binaires versionnés qui
 * divergeraient du SVG. Resvg est déjà utilisé pour les images OpenGraph ; le
 * rendu est déterministe, le build reste reproductible (CID IPFS stable).
 */

validateConfig(rawConfig);

export const prerender = true;

const ICONES = {
  'icon-192': { taille: 192, echelle: 1, fond: false },
  'icon-512': { taille: 512, echelle: 1, fond: false },
  'maskable-512': { taille: 512, echelle: 0.6, fond: true },
  'apple-touch-icon': { taille: 180, echelle: 0.8, fond: true },
} as const;

type NomIcone = keyof typeof ICONES;

export function getStaticPaths() {
  return Object.keys(ICONES).map((nom) => ({ params: { nom } }));
}

const SOURCE = readFileSync(
  fileURLToPath(new URL('../../../public/favicon.svg', import.meta.url)),
  'utf8',
);

/** Contenu intérieur du SVG source (sans la balise <svg> englobante). */
function interieur(svg: string): string {
  const debut = svg.indexOf('>', svg.indexOf('<svg')) + 1;
  const fin = svg.lastIndexOf('</svg>');
  if (debut <= 0 || fin === -1) throw new Error('public/favicon.svg : balise <svg> introuvable');
  return svg.slice(debut, fin);
}

function svgIcone(nom: NomIcone, fond: string): string {
  const { echelle, fond: avecFond } = ICONES[nom];
  const decalage = (32 * (1 - echelle)) / 2;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
    avecFond ? `<rect width="32" height="32" fill="${fond}"/>` : '',
    `<g transform="translate(${decalage} ${decalage}) scale(${echelle})">${interieur(SOURCE)}</g>`,
    '</svg>',
  ].join('');
}

export const GET: APIRoute = ({ params }) => {
  const nom = params.nom as NomIcone;
  const icone = ICONES[nom];
  if (!icone) throw new Error(`Icône inconnue : ${String(params.nom)}`);
  const png = new Resvg(svgIcone(nom, rawConfig.theme.backgroundColor), {
    fitTo: { mode: 'width', value: icone.taille },
  })
    .render()
    .asPng();
  return new Response(png as unknown as BodyInit, { headers: { 'Content-Type': 'image/png' } });
};

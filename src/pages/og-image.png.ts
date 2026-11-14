import type { APIRoute } from 'astro';
import rawConfig from '../data/config.json';
import { validateConfig } from '../utils/validateConfig';
import { renderBoardPng } from '../utils/ogRender';

import type { LayoutConfig } from '../types/config';

validateConfig(rawConfig);

// Pré-rendu au moment du build — fichier statique, pas de serverless requis
export const prerender = true;

// Carte OG du site entier : reprend le premier panneau (les panneaux
// individuels ont leur propre carte sur /og/<id>.png).
export const GET: APIRoute = async () => {
  try {
    const png = await renderBoardPng(rawConfig.billboards[0], rawConfig.theme, rawConfig.layout as LayoutConfig);
    return new Response(png as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    // Relancer plutôt que répondre 500 : voir og/[id].png.ts — le build écrirait
    // le JSON d'erreur sous le nom og-image.png sans échouer.
    throw new Error('Génération de /og-image.png impossible', { cause: error });
  }
};

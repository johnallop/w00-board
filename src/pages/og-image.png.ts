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
    console.error("Erreur lors de la génération de l'image OG :", error);
    return new Response(JSON.stringify({ error: 'Failed to generate image' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

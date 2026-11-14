import type { APIRoute } from 'astro';
import rawConfig from '../../data/config.json';
import { validateConfig } from '../../utils/validateConfig';
import { renderBoardPng } from '../../utils/ogRender';
import type { BillboardItem } from '../../types/config';

import type { LayoutConfig } from '../../types/config';

validateConfig(rawConfig);

export const prerender = true;

export function getStaticPaths() {
  return rawConfig.billboards.map((board) => ({
    params: { id: board.id },
    props: { board },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const board = props.board as BillboardItem;
  try {
    const png = await renderBoardPng(board, rawConfig.theme, rawConfig.layout as LayoutConfig);
    return new Response(png as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    // On relance au lieu de répondre 500 : une route pré-rendue écrit le corps
    // de la réponse tel quel, sans regarder son statut (astro 4.16,
    // core/build/generate.js). Le JSON d'erreur partait donc en production sous
    // le nom /og/<id>.png, avec un build vert. Une exception, elle, fait
    // échouer le build — c'est le seul signal que Cloudflare Pages remonte.
    throw new Error(`Génération de /og/${board.id}.png impossible`, { cause: error });
  }
};

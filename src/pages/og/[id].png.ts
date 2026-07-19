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
    console.error(`Erreur lors de la génération de /og/${board.id}.png :`, error);
    return new Response(JSON.stringify({ error: 'Failed to generate image' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

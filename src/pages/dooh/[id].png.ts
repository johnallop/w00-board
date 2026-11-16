import type { APIRoute } from 'astro';
import rawConfig from '../../data/config.json';
import { validateConfig } from '../../utils/validateConfig';
import { renderDoohPng } from '../../utils/ogRender';
import type { BillboardItem, LayoutConfig } from '../../types/config';

validateConfig(rawConfig);

export const prerender = true;

/**
 * Affiche verticale 1080×1920 par panneau, pour écran DOOH (vitrine, totem,
 * kiosque). Pré-rendue au build comme /og/<id>.png ; le QR code mène à
 * /b/<id>/.
 */
export function getStaticPaths() {
  return rawConfig.billboards.map((board) => ({
    params: { id: board.id },
    props: { board },
  }));
}

export const GET: APIRoute = async ({ props, site }) => {
  const board = props.board as BillboardItem;
  // Même repli que b/[id].astro : le QR imprimé doit désigner la même URL que
  // celui de la page.
  const siteUrl = site?.toString().replace(/\/$/, '') || 'https://board.wooddyviat.com';
  try {
    const png = await renderDoohPng(
      board,
      rawConfig.theme,
      rawConfig.layout as LayoutConfig,
      `${siteUrl}/b/${board.id}/`,
    );
    return new Response(png as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    // Relancer plutôt que répondre 500 : voir og/[id].png.ts — une route
    // pré-rendue écrirait le corps d'erreur sous le nom du PNG, build vert.
    throw new Error(`Génération de /dooh/${board.id}.png impossible`, { cause: error });
  }
};

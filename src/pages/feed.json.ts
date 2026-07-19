import type { APIContext } from 'astro';
import config from '../data/config.json';
import { canonicalizeBillboard, computeFingerprint } from '../utils/posterHash';

export const prerender = true;

export async function GET({ site }: APIContext) {
  const siteUrl = site?.toString().replace(/\/$/, '') ?? '';
  const first = config.billboards[0];

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: "W00-Board — Panneau d'Affichage Décentralisé",
    home_page_url: siteUrl,
    feed_url: `${siteUrl}/feed.json`,
    description: `${config.billboards.length} panneau${config.billboards.length > 1 ? 'x' : ''} — ${first.message}`,
    language: 'fr',
    authors: [{ name: first.author }],
    items: await Promise.all(
      config.billboards.map(async (board) => ({
        id: `w00-board-${board.id}`,
        title: board.message,
        content_text: `${board.message}\n\nSigné par : ${board.author}`,
        // Date déclarée dans config.json — jamais `new Date()` : un rebuild sans
        // changement ne doit pas republier tous les items aux lecteurs.
        ...(board.date ? { date_published: board.date } : {}),
        url: `${siteUrl}/b/${board.id}/`,
        authors: [{ name: board.author }],
        tags: board.tags ?? [],
        // Extension JSON Feed : la spec réserve les clés `_` aux données
        // non standard, qu'un lecteur conforme ignore sans échouer.
        // La chaîne canonique accompagne l'empreinte : un agrégateur peut
        // revérifier l'item sans revenir sur le site.
        _w00_board: {
          algorithm: 'SHA-256',
          canonical: canonicalizeBillboard(board),
          fingerprint: await computeFingerprint(board),
          verify_url: `${siteUrl}/verifier/#${board.id}`,
        },
      }))
    ),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

import type { APIContext } from 'astro';
import config from '../data/config.json';

export const prerender = true;

export async function GET({ site }: APIContext) {
  const siteUrl = site?.toString() ?? '';
  const first = config.billboards[0];

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: "W00-Board — Panneau d'Affichage Décentralisé",
    home_page_url: siteUrl,
    feed_url: `${siteUrl}/feed.json`,
    description: `${config.billboards.length} panneau${config.billboards.length > 1 ? 'x' : ''} — ${first.message}`,
    language: 'fr',
    authors: [{ name: first.author }],
    items: config.billboards.map((board) => ({
      id: `w00-board-${board.id}`,
      title: board.message,
      content_text: `${board.message}\n\nSigné par : ${board.author}`,
      date_published: new Date().toISOString(),
      url: siteUrl,
      authors: [{ name: board.author }],
      tags: board.tags ?? [],
    })),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

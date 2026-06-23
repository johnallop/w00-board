import type { APIContext } from 'astro';
import config from '../data/config.json';

export const prerender = true;

export async function GET({ site }: APIContext) {
  const siteUrl = site?.toString() ?? '';

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: "Panneau d'Affichage Décentralisé",
    home_page_url: siteUrl,
    feed_url: `${siteUrl}/feed.json`,
    description: config.message,
    language: 'fr',
    authors: [{ name: config.author }],
    items: [
      {
        id: '1',
        title: config.message,
        content_text: `${config.message}\n\nSigné par : ${config.author}`,
        date_published: new Date().toISOString(),
        url: siteUrl,
        authors: [{ name: config.author }],
        tags: ['décentralisé', 'ipfs', 'billboard', 'message'],
      },
    ],
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import config from '../data/config.json';

export const prerender = true;

export async function GET(context: APIContext) {
  const first = config.billboards[0];

  return rss({
    title: "W00-Board — Panneau d'Affichage Décentralisé",
    description: `${config.billboards.length} panneau${config.billboards.length > 1 ? 'x' : ''} — ${first.message}`,
    site: context.site!,
    items: config.billboards.map((board, i) => ({
      title: board.message,
      pubDate: new Date(),
      description: `Message signé par ${board.author} — diffusé sur IPFS, Fediverse, Bluesky et Nostr.`,
      link: '/',
      categories: board.tags ?? [],
      customData: `<guid isPermaLink="false">w00-board-${board.id}</guid>`,
    })),
    customData: [
      '<language>fr</language>',
      `<author>${first.author}</author>`,
      '<ttl>60</ttl>',
    ].join('\n'),
  });
}

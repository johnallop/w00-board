import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import config from '../data/config.json';

export const prerender = true;

export async function GET(context: APIContext) {
  return rss({
    title: "Panneau d'Affichage Décentralisé",
    description: config.message,
    site: context.site!,
    items: [
      {
        title: config.message,
        pubDate: new Date(),
        description: `Message signé par ${config.author} — diffusé sur IPFS, Fediverse, Bluesky et Nostr.`,
        link: '/',
      },
    ],
    customData: [
      '<language>fr</language>',
      `<author>${config.author}</author>`,
      '<ttl>60</ttl>',
    ].join('\n'),
  });
}

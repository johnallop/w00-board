import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import config from '../data/config.json';
import { canonicalizeBillboard, computeFingerprint } from '../utils/posterHash';

export const prerender = true;

/**
 * Espaces de noms déclarés sur `<rss>`.
 *
 * `@astrojs/rss` ne déclare de lui-même que `content` : tout autre préfixe
 * utilisé dans `customData` doit passer par ici. Sans `atom`, les deux
 * `<atom:link>` ci-dessous produisent un préfixe non déclaré, donc un XML mal
 * formé qu'un lecteur conforme rejette en bloc — pas seulement l'élément fautif.
 *
 * Une URI de namespace est un simple identifiant : elle n'a pas besoin d'être
 * déréférençable, mais on fait pointer la nôtre vers la page qui l'explique.
 */
const XMLNS = {
  atom: 'http://www.w3.org/2005/Atom',
  w00: 'https://w00-board.pages.dev/ns/authenticity',
};

/** Échappe les 5 entités XML spéciales pour empêcher toute injection dans les champs customData. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(context: APIContext) {
  const first = config.billboards[0];

  // `computeFingerprint` est asynchrone : on résout avant d'appeler rss(), qui
  // attend un tableau d'objets et sérialiserait des Promise en éléments vides.
  const items = await Promise.all(
    config.billboards.map(async (board) => ({
      title: board.message,
      // Date déclarée dans config.json — jamais `new Date()` : un rebuild sans
      // changement ne doit pas republier tous les items aux lecteurs RSS.
      pubDate: board.date ? new Date(board.date) : undefined,
      description: `Message signé par ${board.author} — diffusé sur le Fediverse, Bluesky et Nostr.`,
      link: `/b/${board.id}/`,
      categories: board.tags ?? [],
      // `customData` est injecté tel quel dans le XML : la chaîne canonique
      // contient des guillemets et peut contenir `&` ou `<`, donc elle passe
      // obligatoirement par escapeXml(). L'empreinte est hexadécimale, mais on
      // l'échappe aussi pour ne pas dépendre de cette garantie à distance.
      customData: [
        `<guid isPermaLink="false">w00-board-${escapeXml(board.id)}</guid>`,
        `<w00:fingerprint algorithm="SHA-256">${escapeXml(await computeFingerprint(board))}</w00:fingerprint>`,
        `<w00:canonical>${escapeXml(canonicalizeBillboard(board))}</w00:canonical>`,
      ].join(''),
    }))
  );

  return rss({
    title: "W00-Board — Panneau d'Affichage Décentralisé",
    description: `${config.billboards.length} panneau${config.billboards.length > 1 ? 'x' : ''} — ${first.message}`,
    site: context.site!,
    xmlns: XMLNS,
    items,
    customData: [
      '<language>fr</language>',
      `<author>${escapeXml(first.author)}</author>`,
      '<ttl>60</ttl>',
      '<atom:link rel="hub" href="https://pubsubhubbub.appspot.com/"/>',
      `<atom:link rel="self" href="${new URL('/feed.xml', context.site!).toString()}" type="application/rss+xml"/>`,
    ].join('\n'),
  });
}


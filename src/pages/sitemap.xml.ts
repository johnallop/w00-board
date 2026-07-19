import type { APIContext } from 'astro';
import config from '../data/config.json';

export const prerender = true;

export async function GET({ site }: APIContext) {
  const siteUrl = site?.toString().replace(/\/$/, '') ?? '';

  // Jamais `new Date()` : lastmod vient des dates déclarées dans config.json,
  // pour un build reproductible octet à octet (CID IPFS stable).
  const boardDates = config.billboards
    .map((b) => b.date)
    .filter((d): d is string => typeof d === 'string');
  const latestDate = boardDates.length > 0
    ? boardDates.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b))
    : undefined;

  const dayOf = (iso: string) => iso.split('T')[0];

  const urls = [
    `  <url>
    <loc>${siteUrl}/</loc>${latestDate ? `
    <lastmod>${dayOf(latestDate)}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`,
    ...config.billboards.map((board) => `  <url>
    <loc>${siteUrl}/b/${board.id}/</loc>${board.date ? `
    <lastmod>${dayOf(board.date)}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

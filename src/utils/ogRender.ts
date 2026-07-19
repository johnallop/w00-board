import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import type { BillboardItem, ThemeConfig, LayoutConfig } from '../types/config';
import { renderOgImage } from './ogTemplate';

let fontData: Buffer | ArrayBuffer | null = null;

async function getFontData(): Promise<Buffer | ArrayBuffer> {
  if (!fontData) {
    try {
      const fontPath = path.join(process.cwd(), 'src/data/inter-latin-700-normal.woff');
      if (fs.existsSync(fontPath)) {
        fontData = fs.readFileSync(fontPath);
      } else {
        throw new Error('Local font file not found');
      }
    } catch {
      const fontUrl = 'https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-700-normal.woff';
      const fontResponse = await fetch(fontUrl);
      if (!fontResponse.ok) {
        throw new Error(`Failed to fetch font from ${fontUrl}`);
      }
      fontData = await fontResponse.arrayBuffer();
    }
  }
  return fontData;
}

/**
 * Rend la carte OG PNG (1200×630) d'un panneau — utilisé par /og-image.png et /og/[id].png.
 *
 * Passe par `renderOgImage` et non `renderBoardImage` : une seule police est
 * enregistrée ci-dessous, donc tout point de code hors de son cmap sortirait en
 * carré `.notdef`. L'aiguillage est ici plutôt que dans chaque route, pour que
 * les deux routes soient couvertes par construction — une troisième route
 * ajoutée demain le serait aussi.
 */
export async function renderBoardPng(
  board: BillboardItem,
  theme: ThemeConfig,
  layout: LayoutConfig
): Promise<Uint8Array> {
  const fontBuffer = await getFontData();

  const svg = await satori(renderOgImage(board, theme, layout) as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'Inter',
        data: fontBuffer,
        weight: 700,
        style: 'normal',
      },
    ],
  });

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
  return resvg.render().asPng();
}

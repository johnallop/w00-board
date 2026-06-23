import type { APIRoute } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import rawConfig from '../data/config.json';
import { validateConfig } from '../utils/validateConfig';
import { resolveAlignment } from '../utils/alignment';

import fs from 'node:fs';
import path from 'node:path';

validateConfig(rawConfig);
const config = rawConfig;

// Pré-rendu au moment du build (compatible IPFS/Fleek — pas de serverless requis)
export const prerender = true;

let fontData: ArrayBuffer | null = null;

async function getFontData() {
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

function parseScaledFontSize(fontSize: string): number {
  if (fontSize.includes('rem')) return Math.round(parseFloat(fontSize) * 18);
  if (fontSize.includes('px')) return Math.round(parseFloat(fontSize) * 1.2);
  return 48;
}

export const GET: APIRoute = async () => {
  try {
    const fontBuffer = await getFontData();
    const { justifyValue, alignValue, textAlignValue } = resolveAlignment(config.layout);
    const scaledFontSize = parseScaledFontSize(config.theme.fontSize);

    const svg = await satori(
      {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: justifyValue,
            alignItems: alignValue,
            backgroundColor: config.theme.backgroundColor,
            width: '100%',
            height: '100%',
            padding: '80px',
            boxSizing: 'border-box',
            fontFamily: 'Inter',
          },
          children: [
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '24px',
                  padding: '60px',
                  maxWidth: '900px',
                  width: '100%',
                  boxSizing: 'border-box',
                },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '30px',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              backgroundColor: config.theme.accentColor,
                            },
                          },
                        },
                        {
                          type: 'span',
                          props: {
                            style: {
                              fontSize: '14px',
                              fontWeight: 700,
                              color: config.theme.textColor,
                              opacity: 0.8,
                              letterSpacing: '1px',
                              textTransform: 'uppercase',
                            },
                            children: 'Réseau Actif / Live',
                          },
                        },
                      ],
                    },
                  },
                  {
                    type: 'h1',
                    props: {
                      style: {
                        fontSize: `${scaledFontSize}px`,
                        fontWeight: 800,
                        color: config.theme.textColor,
                        lineHeight: 1.3,
                        margin: '0 0 30px 0',
                        textAlign: textAlignValue,
                      },
                      children: config.billboards[0].message,
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      style: {
                        height: '1px',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        width: '100%',
                        marginBottom: '20px',
                      },
                    },
                  },
                  {
                    type: 'p',
                    props: {
                      style: {
                        fontSize: '20px',
                        color: config.theme.textColor,
                        opacity: 0.6,
                        margin: 0,
                        display: 'flex',
                      },
                      children: [
                        'Signé par : ',
                        {
                          type: 'span',
                          props: {
                            style: {
                              color: config.theme.accentColor,
                              fontWeight: 700,
                              marginLeft: '6px',
                            },
                            children: config.billboards[0].author,
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      {
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
      }
    );

    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
    const pngBuffer = resvg.render().asPng();

    return new Response(pngBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('Erreur génération image OG :', message);
    return new Response(
      JSON.stringify({ error: 'Failed to generate image', details: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

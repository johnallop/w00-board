import { defineConfig } from 'astro/config';
import compress from '@playform/compress';

// ⚠️ Mettre à jour avec votre URL Fleek définitive après création du site
const SITE_URL = 'https://w00-board.pages.dev';

export default defineConfig({
  output: 'static',
  site: SITE_URL,
  integrations: [
    compress({
      CSS: true,
      HTML: true,
      JavaScript: true,
      Image: false, // géré manuellement via og-image.png.ts
      SVG: true,
    }),
  ],
});

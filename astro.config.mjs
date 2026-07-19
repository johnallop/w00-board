import { defineConfig } from 'astro/config';
import compress from '@playform/compress';
import { precacheManifeste } from './src/utils/precacheManifeste';

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
    /*
     * APRÈS compress, délibérément : les hooks astro:build:done s'exécutent dans
     * l'ordre du tableau, et le manifeste doit nommer les fichiers tels qu'ils
     * sont livrés. Le minifieur ne renomme rien aujourd'hui — mais il réécrit
     * bel et bien des .json (le journal du build le montre sur build.json et
     * feed.json), donc supposer qu'il laisse dist/ intact serait faux. Lister en
     * dernier reste vrai qu'il renomme ou non.
     */
    precacheManifeste(),
  ],
});

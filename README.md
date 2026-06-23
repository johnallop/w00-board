# Astro Billboard

Panneau d'affichage décentralisé piloté par un seul fichier de configuration. Modifiez `src/data/config.json` pour changer le message, le thème et la mise en page — le site, l'image OpenGraph et le flux IA se mettent à jour automatiquement au prochain déploiement.

## Démarrage rapide

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # Build de production
npm run preview   # Aperçu du build
npm test          # Tests unitaires
```

## Configuration

Tout le contenu et l'apparence sont contrôlés par **`src/data/config.json`** :

```json
{
  "message": "Votre message ici",
  "author": "Nom de l'auteur",
  "theme": {
    "backgroundColor": "#0f172a",
    "textColor": "#f8fafc",
    "accentColor": "#38bdf8",
    "fontSize": "2.5rem",
    "fontFamily": "Inter"
  },
  "layout": {
    "horizontalAlignment": "center",
    "verticalAlignment": "center"
  }
}
```

### Options d'alignement

| Champ | Valeurs acceptées |
|-------|------------------|
| `horizontalAlignment` | `left`, `center`, `right` |
| `verticalAlignment` | `top`, `center`, `bottom` |

La config est **validée au démarrage** — une valeur invalide provoque une erreur claire plutôt qu'un rendu silencieusement cassé.

## Architecture

```
src/
├── data/
│   ├── config.json                 # Source de vérité unique
│   └── inter-latin-700-normal.woff # Police locale pour l'image OG
├── types/
│   └── config.ts                   # Interface TypeScript BillboardConfig
├── utils/
│   ├── alignment.ts                # Maps d'alignement partagées
│   └── validateConfig.ts           # Validation runtime de la config
├── layouts/
│   └── Layout.astro                # Template HTML, SEO, Service Worker
├── pages/
│   ├── index.astro                 # Page principale (rendu statique)
│   ├── llms.txt.ts                 # Endpoint markdown pour les IA
│   └── og-image.png.ts             # Image OG dynamique 1200×630px (serverless)
└── tests/
    ├── alignment.test.ts
    └── validateConfig.test.ts
public/
└── sw.js                           # Service Worker (offline + stale-while-revalidate)
```

## Ce que génère le site

| URL | Format | Usage |
|-----|--------|-------|
| `/` | HTML | Page principale pour les visiteurs |
| `/llms.txt` | Markdown | Consommation par les IA (AEO/GEO) |
| `/og-image.png` | PNG 1200×630 | Aperçu pour les réseaux sociaux |

## Déploiement

### Vercel (recommandé)

```bash
npm install -g vercel
vercel
```

Le fichier `vercel.json` inclut des en-têtes de sécurité (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy).

### Autres plateformes

Remplacez l'adapter dans `astro.config.mjs` :

```js
// Cloudflare Pages
import cloudflare from '@astrojs/cloudflare';
export default defineConfig({ output: 'hybrid', adapter: cloudflare() });

// GitHub Pages (statique uniquement — sans image OG dynamique)
export default defineConfig({ output: 'static' });
```

## Mode hors-ligne

Le Service Worker met en cache la page d'accueil au premier chargement. Les visites suivantes utilisent la stratégie **stale-while-revalidate** : réponse instantanée depuis le cache avec mise à jour silencieuse en arrière-plan.

## Tests

```bash
npm test          # Exécution unique
npm run test:watch  # Mode watch
```

Les tests couvrent les utilitaires `alignment` et `validateConfig`.

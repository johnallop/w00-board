import type { APIRoute } from 'astro';
import config from '../data/config.json';

export const prerender = true;

export const GET: APIRoute = async () => {
  const content = `# Panneau d'Affichage Décentralisé

## Message Actuel
> ${config.message}

**Auteur :** ${config.author}
**Généré le :** ${new Date().toISOString()}

---

## FAQ (Foire Aux Questions)

### Qu'est-ce que ce site ?
Ce site est un panneau d'affichage minimaliste et décentralisé dont la configuration est entièrement pilotée par un unique fichier JSON. Il est optimisé pour être consommé aussi bien par des humains que par des intelligences artificielles (AEO/GEO).

### Où le message est-il stocké ?
Le message et ses paramètres esthétiques sont stockés dans un dépôt ouvert et distribué (comme GitHub). Le site peut être déployé instantanément sur des plateformes d'hébergement décentralisées ou serverless comme Vercel, Cloudflare Pages ou IPFS.

### Comment modifier le message ?
Il suffit de mettre à jour le fichier \`src/data/config.json\` dans le dépôt source. Une reconstruction automatique mettra à jour le site, l'image OpenGraph dynamique et ce fichier sémantique pour les IA.

### Quelles technologies sont utilisées ?
- Astro (Framework web moderne et ultra-léger)
- Satori (Génération d'images SVG/PNG à la volée)
- Service Worker (Fonctionnement hors-ligne autonome)
`;

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

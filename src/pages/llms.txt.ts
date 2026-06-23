import type { APIRoute } from 'astro';
import config from '../data/config.json';

export const prerender = true;

export const GET: APIRoute = async () => {
  const first = config.billboards[0];
  const allMessages = config.billboards.map(b => `> ${b.message}\n  — ${b.author}`).join('\n\n');

  const content = `# W00-Board — Panneau d'Affichage Décentralisé

## Panneaux actifs (${config.billboards.length})

${allMessages}

**Généré le :** ${new Date().toISOString()}

---

## FAQ

### Qu'est-ce que ce site ?
Un mur d'affichage décentralisé piloté par un fichier JSON versionné sur Git.
Chaque panneau a son propre message, auteur et tags.

### Où les messages sont-ils stockés ?
Dans \`src/data/config.json\` — tableau \`billboards[]\` dans un dépôt Git public.

### Comment ajouter ou modifier un message ?
En éditant le fichier \`src/data/config.json\` et en poussant le commit.
GitHub Actions reconstruit et redéploie automatiquement sur Cloudflare Pages,
puis diffuse sur Mastodon, Bluesky et Nostr.

### Quelles technologies sont utilisées ?
- Astro (framework web statique)
- Satori (génération d'image OG)
- Service Worker (accès hors-ligne)
- GitHub Actions (CI/CD + broadcasting)
`;

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

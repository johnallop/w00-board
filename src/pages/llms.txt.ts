import type { APIRoute } from 'astro';
import config from '../data/config.json';

export const prerender = true;

export const GET: APIRoute = async () => {
  const allMessages = config.billboards.map(b => `> ${b.message}\n  — ${b.author}`).join('\n\n');

  // Jamais `new Date()` au build : la date affichée est celle de la dernière
  // publication déclarée dans config.json (build reproductible, CID stable).
  const boardDates = config.billboards
    .map((b) => b.date)
    .filter((d): d is string => typeof d === 'string');
  const lastPublished = boardDates.length > 0
    ? boardDates.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b))
    : 'non datée';

  const content = `# W00-Board — Panneau d'Affichage Décentralisé

## Panneaux actifs (${config.billboards.length})

${allMessages}

**Dernière publication :** ${lastPublished}

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

### Comment vérifier qu'une citation est authentique ?
Chaque panneau porte une empreinte SHA-256 de son contenu publié.
Empreintes et chaînes canoniques : \`/llms-full.txt\`, \`/feed.json\` ou \`/build.json\`.
Recalcul dans le navigateur : \`/verifier/\`.
Volontairement absentes de ce fichier court : une empreinte séparée de sa chaîne
source ne se vérifie pas, et ressemblerait à une preuve sans en être une.

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

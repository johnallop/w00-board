/**
 * Publie le message du billboard sur Bluesky via AT Protocol.
 *
 * Secrets requis :
 *   BLUESKY_HANDLE
 *   BLUESKY_PASSWORD
 */

import { AtpAgent, RichText } from '@atproto/api';

/**
 * Limite du lexicon `app.bsky.feed.post.text` : 300 GRAPHÈMES (et 3000 octets),
 * relevée dans le paquet installé (@atproto/api 0.20.18).
 */
export const LIMITE_GRAPHEMES = 300;

const decoupeur = new Intl.Segmenter('fr', { granularity: 'grapheme' });
const graphemes = (texte) => [...decoupeur.segment(texte)].map((s) => s.segment);
const longueurBluesky = (texte) => new RichText({ text: texte }).graphemeLength;

/**
 * Texte du post, garanti sous la limite.
 *
 * L'ancienne troncature comptait en unités UTF-16 (`.length`) et ne retirait
 * que la place de l'URL : préfixe, signature et points de suspension étaient
 * oubliés. Un message de 400 caractères donnait 309 graphèmes, rejetés par
 * Bluesky — le canal échouait pour tout message long. Ici le budget se mesure
 * sur le texte FINAL complet, avec le compteur de graphèmes du SDK lui-même ;
 * les hashtags ne sont sacrifiés que si le message n'a plus de place.
 *
 * @param {{message: string, author: string, hashtags: string, url: string}} p
 * @returns {string}
 */
export function composerTexte({ message, author, hashtags, url }) {
  const gabarit = (m, h) => `📋 ${m}\n\n— ${author}${h ? `\n${h}` : ''}\n\n🔗 ${url}`;
  const complet = gabarit(message, hashtags);
  if (longueurBluesky(complet) <= LIMITE_GRAPHEMES) return complet;

  const morceaux = graphemes(message);
  for (const h of [hashtags, '']) {
    let budget = LIMITE_GRAPHEMES - longueurBluesky(gabarit('…', h)) + 1;
    // Garder au moins quelques mots du message ; sinon on retente sans hashtags.
    while (budget >= 20) {
      const texte = gabarit(`${morceaux.slice(0, budget).join('').trimEnd()}…`, h);
      if (longueurBluesky(texte) <= LIMITE_GRAPHEMES) return texte;
      budget -= 1;
    }
  }
  throw new Error(`Bluesky : signature et URL dépassent à elles seules ${LIMITE_GRAPHEMES} graphèmes`);
}

/**
 * @param {object} params
 * @param {string} params.message
 * @param {string} params.author
 * @param {string} params.hashtags
 * @param {string} params.url
 * @returns {Promise<void>}
 */
export async function post({ message, author, hashtags, url }) {
  const { BLUESKY_HANDLE, BLUESKY_PASSWORD } = process.env;

  if (!BLUESKY_HANDLE || !BLUESKY_PASSWORD) {
    throw new Error('Variables manquantes : BLUESKY_HANDLE ou BLUESKY_PASSWORD');
  }

  const agent = new AtpAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier: BLUESKY_HANDLE, password: BLUESKY_PASSWORD });

  // Sans facettes, Bluesky affiche l'URL et les hashtags en texte brut, non
  // cliquables : `agent.post` ne les détecte pas lui-même.
  const rt = new RichText({ text: composerTexte({ message, author, hashtags, url }) });
  await rt.detectFacets(agent);

  await agent.post({
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
  });

  console.log('✓ Message publié sur Bluesky');
}

// Exécution directe si lancé directement
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('post-bluesky.mjs')) {
  const { MESSAGE, AUTHOR, HASHTAGS, SITE_URL } = process.env;
  if (!MESSAGE || !AUTHOR) {
    console.error('MESSAGE et AUTHOR requis en variables d\'environnement');
    process.exit(1);
  }
  post({
    message: MESSAGE,
    author: AUTHOR,
    hashtags: HASHTAGS || '#Billboard',
    url: SITE_URL || 'https://board.wooddyviat.com',
  }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}


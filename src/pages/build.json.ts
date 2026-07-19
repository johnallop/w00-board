import rawConfig from '../data/config.json';
import { validateConfig } from '../utils/validateConfig';
import { canonicalizeBillboard, computeFingerprint } from '../utils/posterHash';

export const prerender = true;

/**
 * Manifeste de build : commit déployé + empreinte d'authenticité par panneau.
 *
 * `scripts/announce.mjs` interroge ce fichier pour savoir si le déploiement est
 * live, en ne lisant que `commit` — les champs ajoutés ici sont donc
 * rétrocompatibles.
 *
 * La chaîne canonique est publiée à côté de l'empreinte : sans elle, personne ne
 * pourrait refaire le calcul. C'est ce qui rend la vérification indépendante
 * plutôt que déclarative.
 */
export async function GET() {
  validateConfig(rawConfig);

  const commit = process.env.GITHUB_SHA || 'dev';

  const billboards = await Promise.all(
    rawConfig.billboards.map(async (board) => ({
      id: board.id,
      canonical: canonicalizeBillboard(board),
      fingerprint: await computeFingerprint(board),
    }))
  );

  const body = {
    commit,
    fingerprints: {
      algorithm: 'SHA-256',
      encoding: 'UTF-8',
      // Recette reproductible à la main, sans ce dépôt ni ce site.
      recipe: "printf '%s' <canonical> | sha256sum",
      billboards,
    },
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}

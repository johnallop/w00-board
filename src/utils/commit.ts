/**
 * Le commit qui a produit ce build, tel qu'il est publié dans `/build.json` et
 * tel qu'il nomme le cache du service worker.
 *
 * POURQUOI DEUX VARIABLES, ET POURQUOI CE MODULE EXISTE.
 *
 * `GITHUB_SHA` n'est renseignée que par GitHub Actions. Or personne ne déploie
 * depuis GitHub Actions : Cloudflare Pages surveille `main` et bâtit sur SON
 * runner, où cette variable n'existe pas — Cloudflare y expose
 * `CF_PAGES_COMMIT_SHA`. Les trois mécanismes qui reposent sur cette valeur
 * étaient donc inertes en production, tous les trois en silence :
 *
 *   1. `/build.json` publiait `"commit": "dev"` à chaque déploiement.
 *   2. Le cache du service worker s'appelait `w00-board-dev` indéfiniment, donc
 *      ne tournait jamais d'une version à l'autre — précisément le défaut que
 *      le lot 8 avait supprimé en dérivant le nom du commit au lieu d'un « v3 »
 *      incrémenté à la main. Le fait avait cessé d'être tenu par la mémoire
 *      d'un humain pour être tenu par une variable absente : pas mieux.
 *   3. `scripts/announce.mjs` attend que `/build.json` porte le SHA poussé avant
 *      de lancer les pings de découverte. La condition ne pouvait pas devenir
 *      vraie : la porte épuisait ses cinq minutes à chaque push, journalisait un
 *      avertissement, et laissait passer. Elle n'a jamais rien gardé.
 *
 * Aucun des trois ne casse visiblement — c'est ce qui leur a permis de durer.
 *
 * Les deux variables portent la MÊME valeur : le SHA du commit bâti. Les lire
 * toutes les deux fait donc coïncider les octets produits par la CI et ceux
 * produits par Cloudflare, ce qui rapproche le CID épinglé des octets réellement
 * servis. Attention à ne pas surestimer ce gain : ce sont toujours deux builds
 * indépendants, et seul un déploiement depuis le job qui a validé `dist/`
 * fermerait vraiment l'écart.
 *
 * L'ordre est significatif. `GITHUB_SHA` d'abord, pour que la CI — qui calcule
 * le CID de référence — garde la main quand les deux sont présentes.
 *
 * Fonction pure de l'environnement qu'on lui passe, testée dans
 * `src/tests/commit.test.ts`. Elle est la seule entrée non déclarative du build,
 * et l'avoir en un seul endroit est ce qui permet aux tests de mesurer la même
 * expression que les routes, plutôt que d'en recopier une jumelle.
 */
export function resolveCommit(env: Record<string, string | undefined> = process.env): string {
  return env.GITHUB_SHA || env.CF_PAGES_COMMIT_SHA || 'dev';
}

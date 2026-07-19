import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { CHEMIN_MANIFESTE } from '../utils/precacheManifeste';

/**
 * Émet /sw.js depuis le build au lieu de le copier verbatim depuis public/.
 *
 * POURQUOI CE FICHIER A DÉMÉNAGÉ.
 *
 * public/ est recopié tel quel : un fichier qui y vit ne peut rien importer,
 * ne peut pas lire process.env, et surtout n'est vu par AUCUNE des gardes du
 * dépôt. distArtefacts.test.ts parcourt src/, astro.config.mjs et package.json
 * pour détecter un artefact périmé ; reproducibility.test.ts parcourt src/ pour
 * détecter une lecture d'horloge. public/sw.js était hors des deux. Le service
 * worker — la seule pièce du site qui décide ce que voit un visiteur hors
 * ligne — était le fichier le moins surveillé du dépôt.
 *
 * En devenant une route, il gagne les trois choses qui lui manquaient :
 *  - le commit peut entrer dans le nom de cache (voir plus bas) ;
 *  - la liste de précache devient inspectable par un test, donc confrontable
 *    à dist/ ;
 *  - la garde de péremption par mtime s'applique à lui comme aux autres.
 *
 * REPRODUCTIBILITÉ. La seule entrée non déclarative est GITHUB_SHA, déjà
 * sanctionnée par build.json.ts et par la doctrine de check-reproducible.mjs :
 * « les octets ne varient QUE par des entrées déclarées ». À arbre et
 * environnement identiques, la sortie est identique.
 */
export const prerender = true;

const RACINE = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Ce qu'on veut lisible hors ligne. C'est une décision éditoriale — quelles
 * pages valent d'être emportées — donc elle reste écrite à la main. Sa dérive
 * est rattrapée par la confrontation à dist/ dans serviceWorker.test.ts.
 */
const PAGES = ['/', '/index.html', '/live', '/live/index.html'];
const RESSOURCES = ['/llms.txt', '/favicon.svg', '/manifest.webmanifest'];

/**
 * Les polices, elles, ne sont pas une décision : c'est le contenu d'un
 * répertoire. Les réciter à la main, c'est parier qu'on pensera à corriger dix
 * lignes de JavaScript le jour où l'on ajoutera une graisse — le pari que
 * Layout.astro refuse déjà pour ses sélecteurs, au motif que les listes tenues
 * à la main « finissent toujours par mentir ».
 *
 * Le tri est explicite : readdirSync ne garantit pas d'ordre, et un ordre qui
 * flotte ferait varier les octets d'un build à l'autre.
 */
function polices(): string[] {
  return readdirSync(join(RACINE, 'public', 'fonts'))
    .filter((nom) => nom.endsWith('.woff2'))
    .sort()
    .map((nom) => `/fonts/${nom}`);
}

/**
 * Le corps du service worker, paramétré par les deux valeurs que seul le build
 * connaît. Aucun backquote ici : la source est elle-même un littéral gabarit.
 */
function source(cacheName: string, precache: string[]): string {
  return `const CACHE_NAME = ${JSON.stringify(cacheName)};
const PRECACHE_ASSETS = ${JSON.stringify(precache, null, 2)};
const MANIFESTE = ${JSON.stringify(CHEMIN_MANIFESTE)};

/**
 * Dernier recours quand ni le réseau ni le cache ne répondent.
 *
 * La branche « assets » en avait une, la branche « navigation » non : elle
 * retombait sur \`.catch(() => cached)\` avec cached indéfini, et
 * respondWith(Promise<undefined>) rend la page d'erreur du navigateur. Un
 * visiteur hors ligne sur une page jamais visitée voyait donc le message de
 * panne du navigateur, pas celui du site.
 */
function horsLigne(pourNavigation) {
  const corps = pourNavigation
    ? '<!doctype html><html lang="fr"><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Hors ligne — W00-BOARD</title>' +
      '<body style="font:1rem/1.6 system-ui,sans-serif;margin:0;min-height:100vh;' +
      'display:grid;place-items:center;background:#0b0b0f;color:#e8e8ef;padding:2rem">' +
      '<main style="max-width:32rem;text-align:center">' +
      '<h1 style="font-size:1.25rem;margin:0 0 .5rem">Connexion perdue</h1>' +
      '<p style="margin:0;opacity:.75">Cette page n\\u2019a pas encore \\u00e9t\\u00e9 ' +
      'consult\\u00e9e, elle n\\u2019est donc pas disponible hors ligne. ' +
      'Elle se chargera au retour du r\\u00e9seau.</p>' +
      '</main>'
    : 'Connexion perdue. Ce contenu n\\u2019est pas disponible hors-ligne.';

  return new Response(corps, {
    status: 503,
    statusText: 'Service Unavailable',
    headers: new Headers({
      'Content-Type': pourNavigation ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
    }),
  });
}

/**
 * Les sous-ressources hachées, que PRECACHE_ASSETS ne peut pas nommer.
 *
 * cache.add() ne récupère QUE le document : le navigateur n'analyse pas le HTML
 * qu'il vient de cacher, donc ne suit ni ses <link> ni ses <script>. Précacher
 * '/' sans /_astro/*.css ne donnait pas « rien » — ça donnait pire : la page
 * ÉTANT en cache, depuisLeCache() la servait hors ligne toute nue, au lieu de
 * laisser horsLigne(true) dire au visiteur ce qui se passe. Et cela exactement
 * sur les pages jamais visitées, seule raison d'être d'un précache : une page
 * réellement parcourue est déjà complète, mise là par le gestionnaire fetch.
 *
 * La liste vient du build parce qu'elle ne peut venir de nulle part ailleurs :
 * les noms sont hachés, donc inconnus à l'écriture de ce fichier. Voir
 * src/utils/precacheManifeste.ts pour les trois emplacements écartés.
 *
 * no-store vise le cache HTTP, pas le nôtre : un manifeste servi depuis le
 * cache du navigateur nommerait les hachages d'une génération précédente, et
 * chaque installation précacherait des 404. On veut celui de MAINTENANT.
 */
function sousRessources() {
  return fetch(MANIFESTE, { cache: 'no-store' })
    .then((reponse) => {
      // fetch() ne rejette que sur panne réseau : un 404 se résout, et
      // .json() rendrait alors une erreur d'analyse au lieu du vrai motif.
      if (!reponse.ok) throw new Error('HTTP ' + reponse.status);
      return reponse.json();
    })
    .then((liste) => {
      if (!Array.isArray(liste)) throw new TypeError('manifeste non conforme');
      return liste.filter((entree) => typeof entree === 'string');
    })
    .catch((erreur) => {
      // Sans manifeste on précache moins, on ne précache pas faux : les pages
      // et les polices restent emportées. Un échec ici ne coûte pas le cache.
      console.warn('[sw] manifeste des sous-ressources indisponible', erreur);
      return [];
    });
}

/**
 * cache.addAll() est tout-ou-rien : une seule entrée en 404 rejette la
 * promesse, l'installation échoue, et le site n'a AUCUN cache — pas de mode
 * dégradé, pas de message. Une police renommée supprimait le hors-ligne en
 * entier, silencieusement.
 *
 * On tolère donc l'entrée manquante à l'exécution, et on la refuse au build :
 * ce sont deux pannes différentes. La dérive (un chemin qui n'existe plus dans
 * dist/) est un défaut du dépôt, attrapé par serviceWorker.test.ts avant le
 * déploiement. Le transitoire (un CDN qui hoquette pendant l'installation) est
 * un accident, et rien ne justifie qu'il coûte tout le cache. La tolérance
 * seule masquerait la dérive : c'est le test qui l'autorise.
 *
 * Le manifeste suit le même partage : indisponible, il rend une liste vide et
 * l'installation continue ; vide dans dist/, c'est une dérive, et le test la
 * refuse au build.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([caches.open(CACHE_NAME), sousRessources()]).then(([cache, hachees]) =>
      Promise.all(
        PRECACHE_ASSETS.concat(hachees).map((asset) =>
          cache.add(asset).catch((erreur) => {
            console.warn('[sw] precache ignore : ' + asset, erreur);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

/**
 * Le cache de CETTE generation, jamais celui d'une autre.
 *
 * caches.match() sans nom parcourt TOUS les caches, y compris celui d'un build
 * anterieur que activate n'a pas encore supprime. Pour une ressource hachee
 * c'est exactement le defaut qu'on corrige ici : rendre le /_astro/x.CAFE.css
 * d'une generation a un document qui appartient a une autre. On nomme donc
 * toujours le cache qu'on interroge.
 */
function depuisLeCache(requete) {
  return caches.open(CACHE_NAME).then((cache) => cache.match(requete));
}

/**
 * Met la reponse de cote sans retarder ce qu'on rend a la page.
 *
 * clone() DOIT etre appele avant que le corps ne parte a la page : une Response
 * n'est lisible qu'une fois. On clone donc tout de suite, et c'est la copie qui
 * part au cache dans un waitUntil — chaine, pas flottant, sinon le navigateur
 * peut arreter le worker avant l'ecriture (defaut corrige au lot 7).
 */
function memoriser(event, reponse) {
  const copie = reponse.clone();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copie)));
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  if (event.request.mode === 'navigate') {
    // Network-first.
    //
    // C'ETAIT DU STALE-WHILE-REVALIDATE, ET C'EST LA QUE SE TROUVAIT LE DEFAUT.
    // Un document et ses sous-ressources hachees forment une generation
    // indivisible : index.html ne veut rien dire sans les _astro/*.js et *.css
    // exacts qu'il nomme, et le build vide dist/ a chaque fois — apres un
    // deploiement, ces noms-la n'existent plus nulle part, ni sur l'hebergeur
    // ni dans le CAR publie sur IPFS. Rendre le document depuis le cache, donc,
    // c'etait garantir que ses deux sous-ressources partent en 404 : le premier
    // affichage apres chaque mise en ligne se faisait sans style ni script.
    //
    // Le prix est un aller-retour reseau avant le premier rendu. C'est le prix
    // d'une page entiere plutot que d'une page rapide et nue — et hors ligne il
    // n'est pas paye, fetch() echouant immediatement.
    event.respondWith(
      fetch(event.request)
        .then((reponse) => {
          if (reponse && reponse.status === 200) memoriser(event, reponse);
          // Un non-200 sur une navigation est une reponse AU SUJET DE CETTE
          // PAGE : 404 = elle n'existe plus, 5xx = le site est en panne. La
          // remplacer par une copie en cache donnerait a lire une page que le
          // site ne publie plus. On rend la reponse telle quelle.
          return reponse;
        })
        .catch(() => depuisLeCache(event.request).then((cached) => cached || horsLigne(true)))
    );
  } else {
    // Network-first pour les assets statiques (JS, CSS, images).
    event.respondWith(
      fetch(event.request)
        .then((reponse) => {
          if (reponse && reponse.status === 200) {
            memoriser(event, reponse);
            return reponse;
          }
          // fetch() ne REJETTE que sur une panne reseau : un 404 se resout
          // normalement et filait droit vers la page. Le .catch ci-dessous ne
          // couvrait donc que le cas rare, jamais le plus probable — la
          // ressource hachee d'une generation qui vient d'etre remplacee.
          // Contrairement a une navigation, un 404 sur /_astro/x.CAFE.css ne
          // dit rien de la ressource : il dit que le build a change. La copie
          // en cache reste la bonne reponse. A defaut on rend le non-200 tel
          // quel, plutot que de le travestir en panne reseau.
          return depuisLeCache(event.request).then((cached) => cached || reponse);
        })
        .catch(() => depuisLeCache(event.request).then((cached) => cached || horsLigne(false)))
    );
  }
});
`;
}

export function GET(): Response {
  /**
   * Le nom de cache portait 'v3', incremente a la main. Dans un depot dont
   * tout l'appareillage prouve que le build est reproductible et adressable
   * par son contenu, la cle du cache etait le dernier fait tenu par la memoire
   * d'un humain — et l'oublier ne casse rien de visible : ca sert l'ancienne
   * version. Le lot 8 a retire la navigation du stale-while-revalidate, donc
   * cette ancienne version n'est plus ce que le visiteur voit d'emblee ; elle
   * reste ce qu'il voit hors ligne, et ce que la branche « assets » sert quand
   * une ressource hachee n'existe plus. L'oubli reste donc invisible.
   *
   * Meme expression que build.json.ts, pour que les deux manifestes s'accordent
   * par construction plutot que par vigilance.
   */
  const commit = process.env.GITHUB_SHA || 'dev';
  const precache = [...PAGES, ...RESSOURCES, ...polices()];

  return new Response(source(`w00-board-${commit}`, precache), {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}

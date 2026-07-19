import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GET as getSw } from '../pages/sw.js';
import { CHEMIN_MANIFESTE } from '../utils/precacheManifeste';

/*
 * Le service worker était le fichier le moins surveillé du dépôt.
 *
 * Il vivait dans public/, que rien ne parcourt : ni le scan d'horloges de
 * reproducibility.test.ts, ni la garde de péremption de distArtefacts.test.ts,
 * ni aucun test — un grep sur `sw\.js|PRECACHE|CACHE_NAME` ne rendait que les
 * deux lignes d'enregistrement de Layout.astro. C'est pourtant la seule pièce
 * du site qui décide de ce qu'un visiteur voit sans réseau.
 *
 * CE QUE CE FICHIER ÉPINGLE, ET POURQUOI ON L'EXÉCUTE PLUTÔT QUE LE LIRE.
 *
 * Les trois défauts corrigés sont des comportements, pas des chaînes de
 * caractères : « l'installation survit à une entrée manquante », « la
 * revalidation atteint le cache avant que le worker ne meure », « une
 * navigation hors ligne rend une réponse ». Aucune regex ne voit ça. Et
 * @playform/compress minifie dist/sw.js à 60 % — un test qui chercherait
 * `cache.addAll` dans le texte mesurerait la source, pas l'artefact.
 *
 * On construit donc une portée de worker factice et on ÉXÉCUTE les octets
 * émis, ceux de la route et — quand dist/ existe — ceux du fichier minifié.
 *
 * Le faux cache est délibérément asynchrone (un setTimeout dans add et put).
 * Ce n'est pas de la décoration : le Cache API écrit sur disque, et sans ce
 * délai un `cache.put` lancé à côté du waitUntil au lieu d'être chaîné dedans
 * atterrirait quand même dans la Map avant la fin du test. L'assertion « la
 * revalidation a bien atteint le cache » serait alors verte quoi qu'il arrive.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIST = join(ROOT, 'dist');
const ORIGINE = 'https://w00-board.pages.dev';

const REQUIRE_DIST = process.env.W00_REQUIRE_DIST === '1';
const DIST_PRESENT = existsSync(join(DIST, 'sw.js'));

if (REQUIRE_DIST && !DIST_PRESENT) {
  throw new Error(
    'W00_REQUIRE_DIST=1 mais dist/sw.js est absent : lancer `npm run build` avant ce test.'
  );
}

/**
 * La source telle que la route l'émet, avant passage du minifieur.
 *
 * `GET()` rend une `Response`, pas une `Promise<Response>` — l'attente porte
 * donc sur `.text()` seulement. Le `await getSw()` défensif qui traînait ici
 * était signalé par `astro check` (ts 80007) et le retirer est sûr précisément
 * parce que cette commande tourne dans deploy.yml : si `GET` devenait un jour
 * asynchrone, `Promise.text` n'existe pas et la vérification de types le dirait
 * avant le déploiement, au lieu de laisser une attente muette absorber le
 * changement.
 */
const SOURCE_ROUTE = await getSw().text();

/*
 * Les deux artefacts à confronter. dist/ n'est pas toujours là (deploy.yml
 * lance `npm test` AVANT `npm run build`), mais quand il l'est, c'est lui que
 * les navigateurs exécutent.
 */
const ARTEFACTS: Array<{ nom: string; source: string }> = [
  { nom: 'route', source: SOURCE_ROUTE },
  ...(DIST_PRESENT
    ? [{ nom: 'dist/sw.js (minifié)', source: readFileSync(join(DIST, 'sw.js'), 'utf8') }]
    : []),
];

// ───────────────────────────── portée factice ─────────────────────────────

type Requete = { url: string; method: string; mode?: string };

function requete(chemin: string, extra: Partial<Requete> = {}): Requete {
  return { url: new URL(chemin, ORIGINE).href, method: 'GET', ...extra };
}

/** Le Cache API indexe par URL absolue : `add('/')` et une navigation vers `/`
 *  désignent la même entrée. Un faux cache qui les distinguerait rendrait le
 *  test du stale-while-revalidate faux au sens strict — il mesurerait un cache
 *  qui ne peut jamais servir. */
function cle(r: Requete | string): string {
  return new URL(typeof r === 'string' ? r : r.url, ORIGINE).href;
}

/** Rend la main au moins un tour de boucle : voir l'en-tête. */
const differer = () => new Promise((r) => setTimeout(r, 0));

class FauxCache {
  readonly entrees = new Map<string, Response>();
  /** Toutes les tentatives d'ajout, refusées comprises. */
  readonly ajouts: string[] = [];

  constructor(private readonly refuse: (chemin: string) => boolean = () => false) {}

  /** Récupère sans écrire. Séparé pour qu'addAll puisse être atomique. */
  private async charger(chemin: string): Promise<[string, Response]> {
    this.ajouts.push(chemin);
    await differer();
    if (this.refuse(chemin)) throw new TypeError(`Request failed (404) : ${chemin}`);
    return [cle(chemin), new Response(`corps de ${chemin}`)];
  }

  async add(chemin: string): Promise<void> {
    const [k, v] = await this.charger(chemin);
    this.entrees.set(k, v);
  }

  /*
   * addAll est implémenté — et implémenté FIDÈLEMENT, c'est-à-dire tout-ou-rien
   * comme le veut la spécification — alors même que le worker corrigé ne
   * l'appelle plus.
   *
   * Un faux qui ne l'aurait pas rendrait la réfutation malhonnête : en
   * réintroduisant `cache.addAll(PRECACHE_ASSETS)` pour prouver que le test
   * l'attrape, on obtiendrait « addAll is not a function ». Le test échouerait,
   * on croirait la propriété épinglée, et elle ne le serait que par l'absence
   * d'une méthode. Le faux doit offrir l'API complète ; ce sont les assertions
   * qui doivent trancher, pas les trous du décor.
   */
  async addAll(chemins: string[]): Promise<void> {
    const charges = await Promise.all(chemins.map((c) => this.charger(c)));
    for (const [k, v] of charges) this.entrees.set(k, v);
  }

  async put(r: Requete | string, reponse: Response): Promise<void> {
    await differer();
    this.entrees.set(cle(r), reponse);
  }

  async match(r: Requete | string): Promise<Response | undefined> {
    return this.entrees.get(cle(r));
  }
}

class FauxEvenement {
  readonly attentes: Promise<unknown>[] = [];
  reponse: Promise<Response> | Response | undefined;
  respondWithAppele = false;

  constructor(readonly request: Requete) {}

  waitUntil(p: unknown): void {
    this.attentes.push(Promise.resolve(p));
  }

  respondWith(p: Promise<Response> | Response): void {
    this.respondWithAppele = true;
    this.reponse = p;
  }

  /** Attend tout ce que le worker a déclaré devoir survivre à la réponse.
   *  Ce que le worker n'a PAS déclaré n'est pas attendu — c'est exactement la
   *  liberté qu'a le navigateur de tuer le worker, et ce que le test mesure. */
  async finDeVie(): Promise<void> {
    await Promise.all(this.attentes);
  }
}

type Options = {
  /** Chemins dont le précache doit échouer (police renommée, route déplacée). */
  refuse?: (chemin: string) => boolean;
  /** Réseau. Par défaut : hors ligne. */
  reseau?: (r: Requete, init?: { cache?: string }) => Promise<Response>;
  /** Caches déjà présents avant activation (versions antérieures). */
  cachesInitiaux?: string[];
};

function chargerSw(source: string, options: Options = {}) {
  const stock = new Map<string, FauxCache>();
  for (const nom of options.cachesInitiaux ?? []) stock.set(nom, new FauxCache());

  const ouverts: string[] = [];
  const supprimes: string[] = [];
  const avertissements: string[] = [];
  const ecouteurs = new Map<string, (e: FauxEvenement) => void>();
  let nbSkipWaiting = 0;
  let nbClaim = 0;

  const caches = {
    async open(nom: string): Promise<FauxCache> {
      ouverts.push(nom);
      if (!stock.has(nom)) stock.set(nom, new FauxCache(options.refuse));
      return stock.get(nom)!;
    },
    async keys(): Promise<string[]> {
      return [...stock.keys()];
    },
    async delete(nom: string): Promise<boolean> {
      supprimes.push(nom);
      return stock.delete(nom);
    },
    async match(r: Requete | string): Promise<Response | undefined> {
      for (const c of stock.values()) {
        const trouve = await c.match(r);
        if (trouve) return trouve;
      }
      return undefined;
    },
  };

  const portee = {
    addEventListener(type: string, fn: (e: FauxEvenement) => void) {
      ecouteurs.set(type, fn);
    },
    skipWaiting() {
      nbSkipWaiting++;
    },
    clients: {
      claim() {
        nbClaim++;
      },
    },
    location: { origin: ORIGINE },
  };

  const reseau =
    options.reseau ??
    (async () => {
      throw new TypeError('Failed to fetch');
    });

  /*
   * Le vrai fetch() accepte une chaîne OU une Request, et remet toujours une
   * Request au gestionnaire. Le faux ne l'imitait qu'à moitié : les appels du
   * worker passaient tous par event.request, donc la question ne se posait pas.
   * Le précache des sous-ressources appelle fetch(MANIFESTE) avec une chaîne ;
   * sans cette normalisation, un `reseau` qui lit r.url recevrait undefined —
   * un décor infidèle qui ferait échouer un worker correct.
   */
  /*
   * Le second argument est transmis, pas avalé. Un décor qui le jette rendrait
   * `fetch(MANIFESTE, { cache: 'no-store' })` et `fetch(MANIFESTE)`
   * indiscernables — or c'est toute la différence entre un manifeste frais et
   * un manifeste servi par le cache HTTP, qui nommerait les hachages d'une
   * génération précédente et ferait précacher des 404 à chaque installation.
   */
  const fetchInjecte = (r: Requete | string, init?: { cache?: string }): Promise<Response> =>
    reseau(typeof r === 'string' ? requete(r) : r, init);

  new Function('self', 'caches', 'fetch', 'Response', 'Headers', 'console', source)(
    portee,
    caches,
    fetchInjecte,
    Response,
    Headers,
    { warn: (...a: unknown[]) => avertissements.push(a.map(String).join(' ')), log() {}, error() {} }
  );

  return {
    ecouteurs,
    stock,
    ouverts,
    supprimes,
    avertissements,
    skipWaiting: () => nbSkipWaiting,
    claim: () => nbClaim,
    /** Le cache courant : celui que le worker a ouvert en premier. */
    cache: () => stock.get(ouverts[0]!)!,
    async installer(): Promise<FauxEvenement> {
      const e = new FauxEvenement(requete('/'));
      ecouteurs.get('install')!(e);
      await e.finDeVie();
      return e;
    },
    lancerFetch(r: Requete): FauxEvenement {
      const e = new FauxEvenement(r);
      ecouteurs.get('fetch')!(e);
      return e;
    },
  };
}

/** Ce que le worker tente réellement de précacher — lu en l'exécutant, pas en
 *  lisant sa source : la liste survit ainsi à la minification.
 *
 *  Sans options, le réseau par défaut est hors ligne : le manifeste des
 *  sous-ressources échoue, et on n'observe que la liste statique. C'est
 *  volontaire — la plupart des tests portent sur celle-là. Les entrées hachées
 *  s'observent en fournissant un `reseau` qui sert le manifeste. */
async function precache(source: string, options: Options = {}): Promise<string[]> {
  const sw = chargerSw(source, options);
  await sw.installer();
  return sw.cache().ajouts;
}

/** Un réseau qui ne sert QUE le manifeste, avec la liste donnée. Tout le reste
 *  échoue comme hors ligne — cache.add() n'a pas besoin du réseau ici, le faux
 *  cache fabriquant lui-même les corps. */
function reseauManifeste(liste: unknown): (r: Requete) => Promise<Response> {
  return async (r: Requete) => {
    if (new URL(r.url).pathname !== CHEMIN_MANIFESTE) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(liste), {
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });
  };
}

// ──────────────────────────────── artefact ────────────────────────────────

describe('/sw.js — artefact émis', () => {
  it('répond 200 en text/javascript', () => {
    const r = getSw();
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/javascript');
  });

  it('n’expédie plus la liste depuis public/ (le fichier a bien déménagé)', () => {
    expect(
      existsSync(join(ROOT, 'public', 'sw.js')),
      'public/sw.js est de retour : il serait recopié verbatim et masquerait la ' +
        'route, qui redeviendrait morte sans qu’aucun test ne le voie.'
    ).toBe(false);
  });
});

describe.each(ARTEFACTS)('service worker exécuté — $nom', ({ source }) => {
  /*
   * DÉFAUT 1 — cache.addAll() est tout-ou-rien.
   *
   * Une seule entrée en 404 rejetait la promesse d'install : pas de cache du
   * tout, donc plus de hors-ligne, sans le moindre message. Dix chemins écrits
   * à la main, dont trois polices, et zéro test : le jour où l'on renomme une
   * graisse, le mode hors ligne disparaît en silence.
   */
  describe('installation', () => {
    it('précache tout quand tout répond', async () => {
      const sw = chargerSw(source);
      await sw.installer();
      expect(sw.cache().entrees.size).toBe(sw.cache().ajouts.length);
      expect(sw.cache().ajouts.length).toBeGreaterThan(0);
    });

    it('survit à une entrée manquante et garde les autres', async () => {
      const manquant = '/fonts/inter-600.woff2';
      const sw = chargerSw(source, { refuse: (c) => c === manquant });

      const e = new FauxEvenement(requete('/'));
      sw.ecouteurs.get('install')!(e);

      /*
       * Le rejet est converti en valeur au lieu d'être confié à `.resolves`.
       *
       * Ce n'est pas un détour gratuit : `expect(p, message).resolves` JETTE le
       * message. Réfutation faite — en réintroduisant cache.addAll(), cette
       * assertion ne rendait que « promise rejected … instead of resolving »,
       * quand toutes les autres du fichier rendaient bien leur phrase. Or ici
       * la phrase EST le livrable : « rejette » est un fait technique, « ça
       * coûte tout le hors-ligne pour un chemin périmé » est ce qu'un lecteur
       * a besoin de savoir. En prime, la valeur capturée nomme le chemin fautif.
       */
      const echec = await e.finDeVie().then(
        () => null,
        (raison) => String(raison)
      );
      expect(
        echec,
        'L’installation rejette encore sur une entrée manquante : c’est le ' +
          'comportement de cache.addAll(), et il coûte la totalité du cache — ' +
          'donc tout le mode hors ligne — pour un seul chemin périmé.'
      ).toBeNull();

      const cache = sw.cache();
      expect(cache.entrees.has(cle(manquant))).toBe(false);
      expect(cache.entrees.size).toBe(cache.ajouts.length - 1);
      expect(cache.entrees.has(cle('/index.html'))).toBe(true);
    });

    it('nomme l’entrée ignorée au lieu de la taire', async () => {
      // Tolérer sans le dire, ce serait remplacer une panne bruyante par une
      // dérive muette : le contraire de ce que ce lot fait.
      const sw = chargerSw(source, { refuse: (c) => c === '/llms.txt' });
      await sw.installer();
      expect(sw.avertissements.join(' ')).toContain('/llms.txt');
    });

    /*
     * DÉFAUT 4 — le précache ne récupérait que des documents nus.
     *
     * cache.add(url) ne prend QUE les octets du document : le navigateur
     * n'analyse pas le HTML qu'il vient de cacher, donc ne suit ni ses <link>
     * ni ses <script>. Le précache emportait '/' et '/live' sans aucun des
     * _astro/*.css qu'ils réclament — et le résultat était pire que « rien » :
     * la page ÉTANT en cache, depuisLeCache() la servait hors ligne toute nue,
     * au lieu de laisser la réponse 503 expliquer la situation. Le précache
     * dégradait le hors-ligne exactement sur les pages jamais visitées, sa
     * seule raison d'être.
     */
    describe('sous-ressources hachées', () => {
      it('emporte celles que le manifeste annonce', async () => {
        const liste = await precache(source, {
          reseau: reseauManifeste(['/_astro/index.CAFE.css', '/_astro/hoisted.BABE.js']),
        });

        expect(
          liste,
          'Le worker ne précache que des documents. Hors ligne, une page jamais ' +
            'visitée sera servie depuis le cache SANS sa feuille de style ni son ' +
            'script — un rendu nu, pire que la réponse « Connexion perdue ».'
        ).toContain('/_astro/index.CAFE.css');
        expect(liste).toContain('/_astro/hoisted.BABE.js');
      });

      it('garde la liste statique quand le manifeste manque', async () => {
        // Le réseau par défaut est hors ligne : le manifeste échoue. Un échec
        // ici ne doit pas coûter les pages et les polices — même partage que
        // pour une entrée manquante : tolérer l'accident, refuser la dérive.
        const sw = chargerSw(source);
        await sw.installer();

        expect(sw.cache().ajouts).toContain('/index.html');
        expect(sw.cache().ajouts.some((a) => a.startsWith('/_astro/'))).toBe(false);
        expect(sw.avertissements.join(' ')).toContain('manifeste');
      });

      it('refuse un manifeste non conforme au lieu de précacher n’importe quoi', async () => {
        // Un JSON valide mais du mauvais type — page d'erreur d'un hébergeur
        // qui répond 200, redirection avalée, fichier écrasé. `liste.map` sur
        // un objet jetterait DANS le waitUntil et annulerait l'installation.
        const sw = chargerSw(source, { reseau: reseauManifeste({ oups: true }) });
        await sw.installer();

        expect(sw.cache().ajouts).toContain('/index.html');
        /*
         * Le motif nomme la FAUTE, pas le symptôme — et c'est la seule chose
         * qui rende le garde Array.isArray observable. Sans lui, le résultat
         * serait le même (le .catch rattrape aussi bien un « liste.filter is
         * not a function »), mais le journal du visiteur dirait qu'une méthode
         * manque au lieu de dire que le manifeste est du mauvais type. Un garde
         * qui ne change que le message reste un garde : c'est le message qu'on
         * lira le jour où ça arrivera.
         */
        expect(sw.avertissements.join(' ')).toContain('non conforme');
      });

      it('nomme le statut quand le manifeste répond en erreur', async () => {
        /*
         * fetch() ne rejette que sur panne réseau : un 404 se RÉSOUT. Sans le
         * garde `!reponse.ok`, on appellerait .json() sur une page d'erreur et
         * le journal rapporterait une erreur d'analyse — en accusant le format
         * du manifeste alors que le vrai fait est qu'il n'existe plus à cette
         * adresse. Deux pannes très différentes à réparer.
         */
        const sw = chargerSw(source, {
          reseau: async () => new Response('<h1>Not Found</h1>', { status: 404 }),
        });
        await sw.installer();

        expect(sw.cache().ajouts).toContain('/index.html');
        expect(sw.avertissements.join(' ')).toContain('404');
      });

      it('demande le manifeste hors du cache HTTP', async () => {
        /*
         * La fraîcheur est la propriété qui décide si le précache emporte des
         * fichiers ou des 404. Un manifeste servi depuis le cache du navigateur
         * nommerait les hachages d'une génération précédente : chaque nom serait
         * plausible, chaque requête échouerait, et le hors-ligne se dégraderait
         * sans que rien ne le dise. Le commentaire du worker l'affirme ; cette
         * assertion l'observe.
         */
        const vus: Array<{ chemin: string; cache?: string }> = [];
        const sw = chargerSw(source, {
          reseau: async (r, init) => {
            vus.push({ chemin: new URL(r.url).pathname, cache: init?.cache });
            return new Response('[]', { headers: new Headers({ 'Content-Type': 'text/plain' }) });
          },
        });
        await sw.installer();

        expect(vus.find((v) => v.chemin === CHEMIN_MANIFESTE)?.cache).toBe('no-store');
      });

      it('ignore les entrées qui ne sont pas des chemins', async () => {
        const liste = await precache(source, {
          reseau: reseauManifeste(['/_astro/bon.css', 42, null, { chemin: '/_astro/objet.css' }]),
        });

        expect(liste).toContain('/_astro/bon.css');
        expect(liste).not.toContain('42');
        expect(liste.every((a) => a.startsWith('/'))).toBe(true);
      });
    });

    it('appelle skipWaiting', async () => {
      const sw = chargerSw(source);
      await sw.installer();
      expect(sw.skipWaiting()).toBe(1);
    });
  });

  /*
   * DÉFAUT 3 (lot 7) — la revalidation d'arrière-plan flottait.
   *
   * `return cached || reseau` : quand `cached` existe, respondWith se résout
   * immédiatement et `reseau` devient une promesse que rien ne retient. Le
   * navigateur peut arrêter le worker avant qu'elle n'écrive.
   *
   * DÉFAUT 5 (lot 8) — et la politique elle-même était fausse.
   *
   * Le lot 7 a rendu le stale-while-revalidate FIABLE. Le lot 8 constate qu'il
   * ne fallait pas l'appliquer ici. Un document et ses sous-ressources hachées
   * sont une génération indivisible : dist/index.html nomme deux fichiers
   * `_astro/*` précis, et le build vide dist/ à chaque fois — après un
   * déploiement ces noms n'existent plus, ni chez l'hébergeur ni dans le CAR
   * publié. Servir le document depuis le cache, c'était donc garantir deux 404
   * sur ses sous-ressources. Le premier affichage après chaque mise en ligne se
   * faisait sans style ni script.
   *
   * Les deux branches sont désormais network-first, avec une asymétrie
   * délibérée sur les réponses non-200 : voir les tests correspondants.
   */
  describe('navigation (network-first)', () => {
    const versionReseau = () => new Response('version réseau');

    it('sert le réseau, pas le cache, quand les deux répondent', async () => {
      const sw = chargerSw(source, { reseau: async () => versionReseau() });
      await sw.installer();

      const e = sw.lancerFetch(requete('/', { mode: 'navigate' }));
      expect(
        await (await e.reponse!)!.text(),
        'La navigation est servie depuis le cache alors que le réseau ' +
          'répondait. Le document mis en cache nomme les ressources hachées de ' +
          'SA génération ; après un déploiement elles n’existent plus nulle ' +
          'part, donc la page s’affiche sans CSS ni JS. Un document ne se ' +
          'sépare pas de ses sous-ressources.'
      ).toBe('version réseau');
    });

    it('déclare la mise en cache à waitUntil, écriture comprise', async () => {
      const sw = chargerSw(source, { reseau: async () => versionReseau() });
      await sw.installer();

      const e = sw.lancerFetch(requete('/', { mode: 'navigate' }));
      await e.reponse;

      expect(
        e.attentes.length,
        'L’écriture au cache n’est déclarée à aucun waitUntil : le navigateur ' +
          'est libre d’arrêter le worker dès la réponse servie, et la copie ' +
          'hors-ligne n’est jamais rafraîchie.'
      ).toBeGreaterThan(0);

      await e.finDeVie();

      const relu = await sw.cache().match(requete('/'));
      expect(
        await relu!.text(),
        'La durée de vie déclarée est écoulée et le cache contient encore la ' +
          'version périmée : le cache.put est lancé à côté du waitUntil au lieu ' +
          'd’être chaîné dedans, donc rien ne garantit qu’il aboutisse.'
      ).toBe('version réseau');
    });

    it('retombe sur le cache hors ligne, sur une page précachée', async () => {
      const sw = chargerSw(source); // hors ligne
      await sw.installer();

      const e = sw.lancerFetch(requete('/', { mode: 'navigate' }));
      expect(
        await (await e.reponse!)!.text(),
        'Le passage en network-first a emporté le hors-ligne avec lui : une ' +
          'page précachée doit rester lisible sans réseau.'
      ).toBe('corps de /');
    });

    /*
     * L'asymétrie, côté navigation. Un non-200 sur une page est une réponse AU
     * SUJET DE CETTE PAGE. Servir la copie en cache donnerait à lire une page
     * que le site ne publie plus — un 404 masqué, une panne masquée.
     */
    it('rend le 404 du serveur plutôt qu’une copie en cache', async () => {
      const sw = chargerSw(source, {
        reseau: async () => new Response('page supprimée', { status: 404 }),
      });
      await sw.installer();

      const e = sw.lancerFetch(requete('/', { mode: 'navigate' }));
      const r = await e.reponse;

      expect(
        r!.status,
        'Une navigation en 404 est masquée par la copie en cache : le visiteur ' +
          'lit une page que le site ne publie plus, et une panne serveur ' +
          'devient invisible.'
      ).toBe(404);
    });

    it('rend une page 503 lisible hors ligne sur une page jamais visitée', async () => {
      const sw = chargerSw(source); // hors ligne, cache vide
      const e = sw.lancerFetch(requete('/jamais-vue', { mode: 'navigate' }));
      const r = await e.reponse;

      expect(
        r,
        'La branche navigation retombait sur `.catch(() => cached)` avec cached ' +
          'indéfini : respondWith(Promise<undefined>) affiche la page d’erreur ' +
          'du navigateur, pas celle du site.'
      ).toBeInstanceOf(Response);
      expect(r!.status).toBe(503);
      expect(r!.headers.get('content-type')).toContain('text/html');
      expect(await r!.text()).toContain('Connexion perdue');
    });
  });

  describe('assets (network-first)', () => {
    it('sert le réseau et met en cache en déclarant l’écriture', async () => {
      const sw = chargerSw(source, { reseau: async () => new Response('css frais') });
      const e = sw.lancerFetch(requete('/_astro/index.css'));
      expect(await (await e.reponse!)!.text()).toBe('css frais');

      await e.finDeVie();
      const relu = await sw.cache().match(requete('/_astro/index.css'));
      expect(relu, 'La mise en cache de l’asset n’est retenue par rien.').toBeDefined();
    });

    it('retombe sur le cache hors ligne', async () => {
      const sw = chargerSw(source);
      await sw.installer();
      const e = sw.lancerFetch(requete('/favicon.svg'));
      expect(await (await e.reponse!)!.text()).toBe('corps de /favicon.svg');
    });

    /*
     * DÉFAUT 6 (lot 8) — le repli sur le cache ne couvrait que le cas rare.
     *
     * fetch() ne REJETTE que sur une panne de la couche réseau. Un 404 se
     * résout normalement. Le `.catch` qui portait tout le hors-ligne était donc
     * structurellement incapable de se déclencher sur le mode de panne le plus
     * probable : la ressource hachée d'une génération qui vient d'être
     * remplacée. Le test précédent passait — parce qu'il coupait le réseau.
     * C'est la panne qu'on n'avait pas simulée qui traversait.
     *
     * Et c'est ici que l'asymétrie s'inverse : contrairement à une navigation,
     * un 404 sur /_astro/x.CAFE.css ne dit rien de la ressource, il dit que le
     * build a changé. La copie en cache est la bonne réponse.
     */
    it('retombe sur le cache quand le réseau répond 404', async () => {
      const sw = chargerSw(source, {
        reseau: async () => new Response('Not Found', { status: 404 }),
      });
      await sw.installer();

      const e = sw.lancerFetch(requete('/favicon.svg'));
      expect(
        await (await e.reponse!)!.text(),
        'Le 404 est passé tel quel à la page alors que le cache détenait la ' +
          'ressource. fetch() ne rejette pas sur un 404 : le `.catch` ne voit ' +
          'jamais ce cas, qui est pourtant le plus courant après un ' +
          'déploiement — l’ancienne ressource hachée a disparu de dist/.'
      ).toBe('corps de /favicon.svg');
    });

    it('ne travestit pas un non-200 en panne réseau quand le cache est vide', async () => {
      const sw = chargerSw(source, {
        reseau: async () => new Response('boum', { status: 500 }),
      });

      const e = sw.lancerFetch(requete('/_astro/absent.css'));
      const r = await e.reponse;

      expect(
        r!.status,
        'Un 500 sans copie en cache est rendu comme un 503 « connexion ' +
          'perdue » : c’est faux, le réseau a répondu. On rend la réponse ' +
          'telle quelle.'
      ).toBe(500);
    });

    it('rend un 503 texte quand ni réseau ni cache', async () => {
      const sw = chargerSw(source);
      const e = sw.lancerFetch(requete('/_astro/absent.css'));
      const r = await e.reponse;
      expect(r!.status).toBe(503);
      expect(r!.headers.get('content-type')).toContain('text/plain');
    });
  });

  describe('portée des interceptions', () => {
    it.each([
      ['requête non-GET', requete('/', { method: 'POST' })],
      ['origine tierce', { url: 'https://exemple.org/a.js', method: 'GET' }],
    ])('laisse passer sans intercepter (%s)', async (_, r) => {
      const sw = chargerSw(source);
      const e = sw.lancerFetch(r as Requete);
      expect(e.respondWithAppele).toBe(false);
    });
  });

  describe('activation', () => {
    it('supprime les caches d’une autre version et garde le sien', async () => {
      const sw = chargerSw(source, { cachesInitiaux: ['w00-board-cache-v2', 'w00-board-vieux'] });
      await sw.installer();
      const courant = sw.ouverts[0]!;

      const e = new FauxEvenement(requete('/'));
      sw.ecouteurs.get('activate')!(e);
      await e.finDeVie();

      expect(sw.supprimes).toEqual(
        expect.arrayContaining(['w00-board-cache-v2', 'w00-board-vieux'])
      );
      expect(sw.supprimes).not.toContain(courant);
      expect(sw.claim()).toBe(1);
    });
  });
});

/*
 * DÉFAUT 2 — le nom de cache était 'w00-board-cache-v3', incrémenté à la main.
 *
 * Dans un dépôt dont tout l'appareillage prouve que le build est reproductible
 * et adressable par son contenu, la clé du cache était le dernier fait tenu par
 * la mémoire d'un humain. L'oublier ne casse rien de visible : ça sert
 * l'ancienne version. Et comme les navigations sont en stale-while-revalidate,
 * cette ancienne version est celle du premier affichage.
 *
 * Ce test ne vérifie pas la VALEUR du nom — ce serait le même fait tenu à la
 * main, recopié un cran plus loin. Il vérifie le COUPLAGE : deux commits
 * différents doivent donner deux noms différents.
 */
describe('nom de cache dérivé du commit', () => {
  async function nomDeCachePour(sha: string | undefined): Promise<string> {
    const avant = process.env.GITHUB_SHA;
    try {
      if (sha === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = sha;
      const sw = chargerSw(await getSw().text());
      await sw.installer();
      return sw.ouverts[0]!;
    } finally {
      if (avant === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = avant;
    }
  }

  it('change de nom quand le commit change', async () => {
    const a = await nomDeCachePour('a'.repeat(40));
    const b = await nomDeCachePour('b'.repeat(40));

    expect(a).toBe(`w00-board-${'a'.repeat(40)}`);
    expect(
      b,
      'Le nom de cache ne suit pas le commit : il faut penser à l’incrémenter à ' +
        'la main, et l’oublier sert silencieusement l’ancienne version — au ' +
        'premier affichage, puisque les navigations sont en stale-while-revalidate.'
    ).not.toBe(a);
  });

  it('retombe sur « dev » hors CI, comme build.json', async () => {
    // Même expression que build.json.ts : les deux manifestes doivent s'accorder
    // par construction, pas par vigilance.
    expect(await nomDeCachePour(undefined)).toBe('w00-board-dev');
  });
});

// ─────────────────────── confrontation à dist/ ───────────────────────

/**
 * Résout une URL précachée comme le ferait l'hébergeur statique : `/` et
 * `/live` désignent des fichiers `index.html`. Confronter les chemins bruts
 * échouerait sur des entrées pourtant correctes — et le test aurait été
 * neutralisé pour cette raison-là, pas pour la bonne.
 */
function fichierServi(url: string): string | null {
  const chemin = url.replace(/^\//, '');
  const candidats = chemin === '' ? ['index.html'] : [chemin, `${chemin}/index.html`];
  for (const c of candidats) {
    const abs = join(DIST, c);
    if (existsSync(abs) && statSync(abs).isFile()) return c;
  }
  return null;
}

describe.skipIf(!DIST_PRESENT)('PRECACHE_ASSETS confronté à dist/', () => {
  /*
   * La tolérance à l'exécution (défaut 1) répare l'accident : un réseau qui
   * hoquette pendant l'installation ne doit pas coûter tout le cache. Elle ne
   * doit surtout pas répondre à la DÉRIVE — un chemin qui n'existe plus dans
   * dist/ est un défaut du dépôt, et la tolérance seule le rendrait invisible,
   * exactement le silence que ces lots suppriment. D'où cette garde-ci, au
   * build : deux pannes distinctes, deux remèdes distincts.
   */
  /** Le manifeste tel que le build vient de l'écrire, servi au worker comme
   *  l'hébergeur le servira. C'est ce qui étend la confrontation ci-dessous aux
   *  entrées hachées : sans lui, on ne validerait que la liste écrite à la main,
   *  soit exactement la partie qui ne peut pas dériver toute seule. */
  const surLeReseauReel = () =>
    reseauManifeste(JSON.parse(readFileSync(join(DIST, CHEMIN_MANIFESTE.slice(1)), 'utf8')));

  it('chaque entrée précachée correspond à un fichier réellement servi', async () => {
    const liste = await precache(SOURCE_ROUTE, { reseau: surLeReseauReel() });
    const absents = liste.filter((url) => fichierServi(url) === null);
    expect(
      absents,
      'Ces chemins sont précachés mais rien ne les sert dans dist/. À ' +
        'l’exécution ils seront désormais ignorés un par un — le hors-ligne ' +
        'survit — mais ce qu’ils devaient rendre disponible ne l’est pas.'
    ).toEqual([]);
  });

  it('précache réellement quelque chose', async () => {
    // Une liste vide passerait la garde ci-dessus sans rien garantir.
    expect((await precache(SOURCE_ROUTE)).length).toBeGreaterThanOrEqual(8);
  });

  /*
   * La dérive que le module ne peut pas refuser lui-même.
   *
   * listerSousRessources() rend [] quand _astro/ est absent, plutôt que de
   * lever : un site sans sous-ressource est concevable en général. Pour CE
   * dépôt-ci c'en est une, et c'est ici qu'on la refuse — au build, comme pour
   * les chemins périmés. Sans cette garde, une intégration débranchée ou un
   * hook déplacé avant la génération des assets rendrait un manifeste vide, le
   * worker précacherait sagement des pages nues, et tout serait vert.
   */
  it('le manifeste nomme exactement les sous-ressources livrées', () => {
    const manifeste = JSON.parse(
      readFileSync(join(DIST, CHEMIN_MANIFESTE.slice(1)), 'utf8')
    ) as string[];
    const reels = readdirSync(join(DIST, '_astro'))
      .sort()
      .map((nom) => `/_astro/${nom}`);

    expect(
      manifeste,
      'Le manifeste est vide alors que dist/_astro contient des fichiers : le ' +
        'précache n’emportera que des documents nus, et le hors-ligne servira ' +
        'des pages sans style ni script.'
    ).not.toEqual([]);
    expect(manifeste).toEqual(reels);
  });

  it('le précache atteint bien les sous-ressources, pas seulement les pages', async () => {
    const liste = await precache(SOURCE_ROUTE, { reseau: surLeReseauReel() });
    expect(liste.filter((url) => url.startsWith('/_astro/')).length).toBeGreaterThan(0);
  });

  it('la garde a des dents : un chemin inventé est signalé absent', () => {
    expect(fichierServi('/fonts/inter-900.woff2')).toBeNull();
    expect(fichierServi('/')).toBe('index.html');
    expect(fichierServi('/live')).toBe('live/index.html');
  });

  it('la route et l’artefact minifié précachent la même liste', async () => {
    /*
     * Le minifieur ne doit pas réordonner ni perdre d'entrée : c'est dist/sw.js
     * que les navigateurs exécutent, pas la sortie de la route.
     *
     * Le manifeste est servi aux deux, avec le même réseau : sans lui, la
     * comparaison ne porterait que sur la liste écrite en dur — la seule partie
     * qui ne traverse aucun code. Avec lui, elle traverse sousRessources()
     * entier, donc la confrontation attrape une minification qui l'abîmerait.
     */
    const reseau = surLeReseauReel();
    const [route, dist] = await Promise.all([
      precache(SOURCE_ROUTE, { reseau }),
      precache(readFileSync(join(DIST, 'sw.js'), 'utf8'), { reseau }),
    ]);
    expect(dist).toEqual(route);
    expect(dist.some((u) => u.startsWith('/_astro/'))).toBe(true);
  });

  it('couvre toutes les polices livrées', async () => {
    // La liste est dérivée de public/fonts/ ; cette assertion vérifie que la
    // dérivation atteint bien dist/, où le navigateur ira les chercher. Le tri
    // est répété ici parce que readdirSync ne garantit pas d'ordre : c'est la
    // même raison qui met un .sort() explicite dans sw.js.ts.
    const liste = await precache(SOURCE_ROUTE);
    const livrees = readdirSync(join(DIST, 'fonts'))
      .filter((n) => n.endsWith('.woff2'))
      .sort()
      .map((n) => `/fonts/${n}`);
    expect(livrees.length).toBeGreaterThan(0);
    expect(liste.filter((u) => u.startsWith('/fonts/'))).toEqual(livrees);
  });
});

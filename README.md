# W00-BOARD

Panneau d'affichage géant pour le web — « une affiche dans le ciel que personne ne peut manquer ». Tout est piloté par **un seul fichier de configuration** : modifiez `src/data/config.json`, et le mur, l'image OpenGraph, les 4 flux (RSS, JSON Feed, llms.txt, llms-full.txt) et le sitemap se régénèrent au prochain déploiement, pendant que le message est diffusé sur les réseaux décentralisés.

## Démarrage rapide

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # Build de production (dist/)
npm run preview   # Aperçu du build
npm test          # Tests unitaires (vitest)
```

## Configuration

Tout le contenu et l'apparence sont contrôlés par **`src/data/config.json`** :

```json
{
  "billboards": [
    {
      "id": "jesus-aime",
      "message": "JESUS T'AIME",
      "author": "W00DDY",
      "tags": ["Jesus", "Amour", "Foi"],
      "accentColor": "#38bdf8",
      "date": "2026-06-23T13:38:09Z"
    }
  ],
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

Chaque panneau du tableau `billboards[]` possède : `id` (slug URL, unique), `message`, `author`, et en option `tags` (affichés et convertis en hashtags à la diffusion), `accentColor` (surcharge la couleur d'accent du thème pour ce panneau) et `date` (ISO 8601 — fuseau **obligatoire** si une heure est présente, pour un build reproductible ; utilisée comme date de publication dans les flux et le sitemap).

**Période de diffusion** — `startDate` et `endDate`, facultatifs, même format que `date`. Un jour seul s'entend en UTC, et `endDate` le couvre en entier (`"endDate": "2026-12-15"` diffuse jusqu'au 16 à 00:00 UTC). Hors période, le panneau n'est plus montré par le mode kiosque `/live` ni tiré par la rotation hebdomadaire ; sa page `/b/<id>/` reste en ligne et affiche la période. Le filtrage se fait à l'affichage, jamais au build (qui reste reproductible) ; sans JavaScript, `/live` montre le premier panneau comme avant. Limites : la diffusion sociale part toujours à la fusion de la config, même pour une période future, et le mur, les flux et le sitemap listent tous les panneaux. Ces deux champs ne font pas partie de l'empreinte d'authenticité : prolonger une campagne ne change pas son sceau.

### Comptes sociaux associés (optionnel)

La clé `social` relie le panneau à ses comptes publics. Ils apparaissent dans le pied de page de chaque page (liens `rel="me"`, qui permettent par exemple à Mastodon d'afficher le site comme vérifié sur le profil), dans le JSON-LD (`sameAs`) et dans `llms.txt`. Absente ou vide, rien ne s'affiche.

```json
"social": [
  { "network": "mastodon", "url": "https://mastodon.social/@exemple", "label": "@exemple@mastodon.social" },
  { "network": "bluesky", "url": "https://bsky.app/profile/exemple.bsky.social" }
]
```

`network` est l'un de : `mastodon`, `bluesky`, `nostr`, `matrix`, `misskey`, `pixelfed`, `peertube`, `lemmy`, `ntfy`, `telegram`, `discord`, `github`, `youtube`, `instagram`, `threads`, `tiktok`, `linkedin`, `facebook`, `x`, `website`. `url` doit être en `https://` ; `label` (40 caractères au plus) remplace le nom du réseau comme texte du lien. 12 profils au plus.

### Options d'alignement

| Champ | Valeurs acceptées |
|-------|------------------|
| `horizontalAlignment` | `left`, `center`, `right` |
| `verticalAlignment` | `top`, `center`, `bottom` |

La config est **validée au build** (`src/utils/validateConfig.ts`) — une valeur invalide provoque une erreur claire plutôt qu'un rendu silencieusement cassé.

Le site suppose un **fond sombre** : les textes secondaires (dates, légendes, compteurs) sont en blanc translucide, 50 % d'opacité au plus bas. La validation refuse un `backgroundColor` sur lequel ce blanc tombe sous 4,5:1 — un thème clair rendrait ces textes blanc sur blanc.

## Ce que génère le site

| URL | Format | Usage |
|-----|--------|-------|
| `/` | HTML | Le mur : tous les panneaux, filtrables par tag |
| `/b/<id>/` | HTML | Une affiche par panneau — l'URL canonique à partager |
| `/creer/` | HTML | Formulaire de proposition d'un panneau, avec aperçu et validation en direct |
| `/og-image.png` | PNG 1200×630 | Aperçu pour les réseaux sociaux (premier panneau) |
| `/og/<id>.png` | PNG 1200×630 | Carte OG dédiée de chaque panneau |
| `/icons/*.png` | PNG | Icônes de l'application installable (192, 512, maskable, Apple 180), rendues depuis `favicon.svg` |
| `/feed.xml` | RSS 2.0 | Lecteurs de flux |
| `/feed.json` | JSON Feed 1.1 | Lecteurs de flux modernes |
| `/llms.txt` | Markdown | Résumé pour les IA (AEO/GEO) |
| `/llms-full.txt` | Markdown | Contexte complet pour les IA |
| `/sitemap.xml` | XML | Découverte par les moteurs de recherche |

## Architecture

```
src/
├── data/
│   ├── config.json                 # Source de vérité unique
│   └── inter-latin-700-normal.woff # Police locale pour l'image OG
├── types/
│   └── config.ts                   # Interfaces TypeScript (BillboardConfig, BillboardItem)
├── utils/
│   ├── alignment.ts                # Maps d'alignement partagées
│   ├── ogTemplate.ts               # Arbre Satori de la carte OG (pur, testé)
│   ├── ogRender.ts                 # Rendu PNG (satori + resvg, police locale)
│   └── validateConfig.ts           # Validation runtime de la config
├── layouts/
│   └── Layout.astro                # Template HTML, SEO, JSON-LD, CSP, Service Worker
├── pages/
│   ├── index.astro                 # Le mur multi-panneaux (statique)
│   ├── b/[id].astro                # L'affiche individuelle de chaque panneau
│   ├── creer.astro                 # Proposer un panneau (formulaire + aperçu)
│   ├── og/[id].png.ts              # Carte OG dédiée par panneau
│   ├── feed.xml.ts                 # Flux RSS
│   ├── feed.json.ts                # Flux JSON Feed 1.1
│   ├── llms.txt.ts                 # Résumé markdown pour les IA
│   ├── llms-full.txt.ts            # Contexte complet pour les IA
│   ├── sitemap.xml.ts              # Sitemap
│   ├── og-image.png.ts             # Image OG 1200×630 (pré-rendue au build)
│   └── sw.js.ts                    # Service Worker, généré au build (offline + précache)
└── tests/
    ├── alignment.test.ts
    ├── ogTemplate.test.ts
    └── validateConfig.test.ts
scripts/
├── lib/
│   └── proposition.mjs             # Contrat page /creer/ ↔ workflow propose.yml
├── propose-board.mjs               # Issue approuvée → panneau ajouté à config.json
├── post-bluesky.mjs                # Publication Bluesky (AT Protocol)
├── post-matrix.mjs                 # Publication Matrix
├── post-misskey.mjs                # Publication Misskey (Fediverse)
├── post-ntfy.mjs                   # Notification ntfy
└── post-nostr.mjs                  # Publication Nostr
public/
├── _headers                        # En-têtes Cloudflare Pages (CSP, Cache-Control)
├── manifest.webmanifest            # Manifeste PWA
└── robots.txt
.github/workflows/
├── deploy.yml                      # Tests + build + vérification des artefacts
├── broadcast.yml                   # Diffusion multi-protocoles au changement de config
├── propose.yml                     # Proposition approuvée → pull request
└── lighthouse.yml                  # Audit Lighthouse CI (perf, a11y, SEO)
```

## Déploiement — Cloudflare Pages

Le site est **100 % statique** (`output: 'static'`). Cloudflare Pages surveille la branche `main` et déploie automatiquement chaque push sur **https://board.wooddyviat.com** (domaine personnalisé ; `w00-board.pages.dev` reste servi pour les liens déjà diffusés). Le workflow `deploy.yml` sert de filet : tests, build et vérification que les fichiers critiques (`og-image.png`, flux, sitemap…) sont bien générés.

Les en-têtes de sécurité (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy) sont définis dans `public/_headers`.

> ⚠️ La CSP existe en **deux** endroits qui doivent rester synchronisés : la balise `<meta>` dans `src/layouts/Layout.astro` et `public/_headers`. Toute modification doit toucher les deux — `src/tests/headers.test.ts` compare les deux à chaque exécution et échoue si elles divergent.

Pourquoi c'est testé plutôt que recommandé : les politiques CSP sont **intersectives**. Quand plusieurs s'appliquent, le navigateur exige de satisfaire *toutes*. Une divergence n'ouvre donc jamais une faille — elle **casse la page**, en bloquant une source qu'un seul des deux fichiers autorise. Et elle la casse de façon invisible en local, puisque `astro dev` et `astro preview` ne servent pas `public/_headers` : seul Cloudflare Pages le fait. Le premier témoin serait un visiteur devant une page morte.

Une exception assumée : `frame-ancestors` ne figure que dans `public/_headers`. La spécification l'**ignore** dans un `<meta>` ; l'y recopier « pour aligner les deux fichiers » donnerait une symétrie visuelle et zéro protection. Le test exige donc l'égalité *modulo* les directives qu'une balise ne peut pas porter.

## Diffusion multi-protocoles

À chaque modification de `src/data/config.json` poussée sur `main`, le workflow `broadcast.yml` publie le message sur les réseaux configurés. Chaque canal est optionnel : **secret absent → canal ignoré avec un log, jamais d'échec**.

| Secret GitHub | Canal |
|---|---|
| `MASTODON_TOKEN`, `MASTODON_INSTANCE` | Mastodon (Fediverse) |
| `BLUESKY_HANDLE`, `BLUESKY_PASSWORD` | Bluesky (AT Protocol) |
| `NOSTR_PRIVATE_KEY` | Nostr |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Telegram (Bot sendMessage API) |
| `DISCORD_WEBHOOK_URL` | Discord (Webhook URL) — mentions `@everyone`/`@here` neutralisées |
| `MATRIX_HOMESERVER`, `MATRIX_ACCESS_TOKEN`, `MATRIX_ROOM_ID` | Matrix (salon rejoint au préalable par le compte bot) |
| `MISSKEY_INSTANCE`, `MISSKEY_TOKEN` | Misskey et dérivés (Sharkey, Firefish…) — Fediverse |
| `NTFY_TOPIC` (+ optionnels `NTFY_SERVER`, `NTFY_TOKEN`) | ntfy — notifications push, serveur par défaut `https://ntfy.sh` |
| `SITE_URL` | URL canonique (défaut : `https://board.wooddyviat.com`) |

Documentation réseau des trois canaux ajoutés (exigée par `AGENTS.md`) :

- **Données envoyées** : uniquement le texte publié (message, signature, hashtags, URL du panneau), déjà public. Aucune donnée de visiteur.
- **Domaines contactés** : ceux que vous configurez (`MATRIX_HOMESERVER`, `MISSKEY_INSTANCE`, `NTFY_SERVER` ou `ntfy.sh`), depuis le runner GitHub Actions — jamais depuis le navigateur.
- **Coût** : protocoles et logiciels libres, auto-hébergeables. ntfy.sh est gratuit avec des limites de débit (`À vérifier` sur docs.ntfy.sh si le volume augmente) ; un sujet ntfy.sh est **public** — protégez-le par un jeton ou auto-hébergez.
- **Repli** : chaque canal est indépendant ; retirer ses secrets le désactive.
- **Écartés** : X, Threads, LinkedIn, Instagram — API payantes ou soumises à revue d'application, incompatibles avec la règle « libre et gratuit d'abord ». Ils restent affichables comme **profils** via `social[]`.

Ces workflows tournent sous **Node 24** : `nostr-tools` utilise le `WebSocket` global, absent de Node 20 (le heartbeat échouait chaque semaine pour cette raison jusqu'en novembre 2026).

Fiabilité de la diffusion :

- **Attente du déploiement** : au push, rien n'est publié tant que `/build.json` ne sert pas chaque panneau à diffuser **à l'identique** (même forme canonique que son empreinte), 10 minutes au plus. Le critère porte sur le contenu, pas sur le commit : si un push plus récent est déjà déployé avec le panneau intact, la diffusion part ; s'il a modifié le panneau, c'est sa propre diffusion qui annoncera la bonne version. Délai dépassé : diffusion annulée plutôt qu'un lien en 404 ou une affiche périmée annoncés partout.
- **Relance sans doublon** : un « Re-run » garde la même clé d'idempotence. Mastodon (`Idempotency-Key`, 1 h) et Matrix (identifiant de transaction) ignorent la seconde tentative ; les autres canaux, non.
- **Rejouer certains canaux** : le champ `canaux` du lancement manuel (ex. `nostr,matrix`) limite la diffusion aux canaux nommés — à utiliser après un échec partiel.
- Les secrets ne sont exposés qu'à l'étape qui diffuse, pas à `npm ci` ; les workflows déclarent des permissions en lecture seule par défaut.

## Proposer un panneau depuis le site

La page **`/creer/`** permet à n'importe qui de composer un panneau : aperçu en direct, et vérification dans le navigateur par **le même `validateConfig` que le build** (contraste WCAG, identifiant unique), plus des bornes de modération (message ≤ 280 caractères, signature ≤ 60, 5 tags au plus).

Le site reste 100 % statique, sans compte ni base de données : la proposition part en **issue GitHub préremplie** (compte GitHub requis, proposition publique).

1. Un mainteneur relit l'issue et pose le label **`panneau-approuve`** — seul un compte ayant au moins le rôle « triage » peut poser un label.
2. Le workflow `propose.yml` ajoute le panneau **en fin de mur** dans `config.json`, vérifie par un build complet, puis ouvre une **pull request**. En cas d'échec, il explique l'erreur en commentaire de l'issue.
3. La fusion de la PR — geste humain — déclenche le déploiement et la diffusion. Rien n'est publié avant.

Le propriétaire du dépôt peut aussi utiliser « Télécharger config.json » sur la même page pour publier sans passer par la modération.

Mise en place, une seule fois :

```bash
gh label create proposition-panneau --description "Panneau proposé depuis /creer/" --color 38bdf8
gh label create panneau-approuve --description "Approuvé : ouvre la PR d'ajout" --color 22c55e
```

Puis **Settings → Actions → General → « Allow GitHub Actions to create and approve pull requests »**. Limite connue : une PR ouverte par `GITHUB_TOKEN` ne déclenche pas `deploy.yml` ni `lighthouse.yml` ; fermer puis rouvrir la PR relance la CI complète.


## Miroir IPFS

À chaque push sur `main`, le job `ipfs` de `deploy.yml` épingle le build sur IPFS et met à jour un pointeur IPNS **stable** :

- **Adresse stable** : `ipns://k51qzi5uqu5dj2p76paxdtfrdr86kc6txooxipz0l3w4osuyn1rqlu919xrlyi`
- **Passerelle** : <https://ipfs.filebase.io/ipns/k51qzi5uqu5dj2p76paxdtfrdr86kc6txooxipz0l3w4osuyn1rqlu919xrlyi/> (secours, dans un navigateur : `dweb.link`, devenue une passerelle « service worker » qui ne répond plus aux clients HTTP simples)
- **Historique public des CID** : branche [`ipfs-history`](https://github.com/johnallop/w00-board/tree/ipfs-history) (`CIDS.log`, hors `main`)

Le CID est calculé **localement** (`ipfs-car pack dist --no-wrap`) avant tout upload : le contenu est vérifiable et portable indépendamment du service de pinning.

### Setup (une seule fois)

1. **Filebase** (compte créé à la main sur <https://filebase.com>) :

   - créer un bucket de type **IPFS** (par exemple `w00-board`) ;
   - dans *Access Keys*, relever la clé d'accès et la clé secrète ;
   - créer les trois secrets GitHub (chaque commande demande la valeur, qui ne s'affiche pas) :

   ```bash
   gh secret set FILEBASE_KEY --repo johnallop/w00-board
   gh secret set FILEBASE_SECRET --repo johnallop/w00-board
   gh secret set FILEBASE_BUCKET --repo johnallop/w00-board
   ```

   Le job envoie le CAR sur `s3.filebase.com` avec la métadonnée `import=car`, puis exige une preuve : soit le CID annoncé par Filebase (`x-amz-meta-cid`) identique au CID calculé localement, soit, à défaut, le `build.json` du commit servi sous ce CID par `ipfs.filebase.io`. Sans preuve, le job échoue.

2. **Nom IPNS (Filebase)**, créé une seule fois avec un CID déjà épinglé (par exemple le dernier de `CIDS.log`) :

   ```bash
   FILEBASE_KEY=… FILEBASE_SECRET=… node scripts/creer-nom-ipns.mjs <CID>
   ```

   Reporter le `network_key` affiché (`k51…`) dans `src/data/ipfs.ts` (`IPNS_NAME`). La clé privée IPNS reste chez Filebase : aucun autre secret à créer. Ne jamais supprimer ni recréer ce nom : le nom public changerait et casserait tous les liens publiés. Les déploiements le mettent à jour (`PUT /v1/names/w00-board`), puis vérifient qu'il est relu par l'API **et** résolu par la passerelle. Un enregistrement n'est valable que 48 h. Filebase ignore une mise à jour au même CID (mesuré : séquence inchangée), mais re-signe l'enregistrement de lui-même (mesuré le 2026-11-16, non documenté). `heartbeat.yml` **surveille** donc ce renouvellement chaque jour et échoue s'il reste moins de 24 h de validité — le signal pour redéployer.

Secrets absents → le job `ipfs` s'ignore proprement avec un log, le déploiement Cloudflare n'est jamais bloqué.

### Documentation du service (exigée par `AGENTS.md`)

- **Service** : [Filebase](https://filebase.com), via son API S3 (`s3.filebase.com`, AWS CLI préinstallée sur le runner, aucun paquet ajouté) et le packer `ipfs-car` open source. Storacha, utilisé jusqu'en novembre 2026, a fermé.
- **Coût / quotas** (page tarifs consultée le 2026-11-14) : offre gratuite à 5 Go partagés, 10 Go de sortie IPFS et 500 fichiers épinglés ; offre Pro à 7,50 $/mois. Chaque déploiement d'un contenu nouveau épingle un CAR de plus : surveiller le compteur des 500 fichiers et supprimer les anciens CAR du bucket si besoin. Carte bancaire exigée ou non à l'inscription : `À vérifier`.
- **IPNS** : API « IPNS names » de Filebase (`api.filebase.io/v1/names`), 1 nom dans l'offre gratuite, enregistrement valable 48 h et TTL de 5 min ([doc](https://filebase.com/docs/ipfs/ipns-names)). w3name, utilisé avant, publiait des enregistrements que le réseau IPFS ne trouvait pas (constaté le 2026-11-15).
- **Domaines contactés** : `s3.filebase.com` (envoi, depuis la CI) ; `api.filebase.io` (nom IPNS, depuis la CI) ; `ipfs.filebase.io` (passerelle publique de lecture et de vérification) ; `delegated-ipfs.dev` (routage IPFS public, depuis la CI : lecture de l'échéance de l'enregistrement, seul le nom public est envoyé).
- **Données envoyées** : uniquement le contenu déjà public du site (`dist/`). Aucune donnée personnelle.
- **Portabilité / stratégie de sortie** : le CID est calculé localement avant upload ; n'importe quel autre service de pinning (Pinata…) ou un nœud Kubo auto-hébergé peut resservir **le même CID à l'identique**. Changer de service = changer une seule commande d'upload dans le job.
- **Repli si l'IPNS échoue** : le pin reste effectif et la branche `ipfs-history` donne toujours le dernier CID connu — l'étape IPNS est en `continue-on-error`.

## Analytics — Cloudflare Web Analytics

Le site utilise Cloudflare Web Analytics, activable depuis le dashboard Cloudflare (Pages → projet → Metrics), qui injecte automatiquement le beacon. La CSP autorise déjà les domaines nécessaires.

Documentation réseau (exigée par `AGENTS.md`) :

- **Domaines contactés** : `static.cloudflareinsights.com` (chargement du script) et `cloudflareinsights.com` (envoi des mesures).
- **Données envoyées** : pages vues, referrer, user-agent. **Pas de cookie, pas de fingerprinting, pas d'identifiant persistant.**
- **Finalité** : mesurer quel canal de diffusion (Mastodon, Bluesky, Nostr…) amène réellement du trafic, via les referrers.
- **Rétention** : ≈ 6 mois côté Cloudflare (`À vérifier` lors de l'activation).
- **Repli sans réseau** : désactiver l'injection dans le dashboard et retirer les deux entrées CSP correspondantes — aucune autre dépendance.
- **Alternative libre auto-hébergeable** : GoatCounter ou Plausible. Écartées pour l'instant car elles nécessitent un serveur, alors que l'hébergement reste 100 % statique.

## Mode hors-ligne

Le Service Worker est **généré au build** par la route `src/pages/sw.js.ts` et servi à la racine (`/sw.js`). À l'installation il précharge la liste d'assets produite par le build (`/precache-assets.json`) ; les visites suivantes utilisent la stratégie **network-first**, pour les navigations comme pour les sous-ressources : le réseau d'abord, le cache en repli.

Pourquoi pas la stratégie inverse — servir le cache d'abord et revalider derrière — qui rendrait pourtant la page plus vite : un document et ses sous-ressources hachées forment une génération indivisible. `index.html` ne veut rien dire sans les `_astro/*.js` et `*.css` exacts qu'il nomme, et le build vide `dist/` à chaque fois — après un déploiement, ces noms-là n'existent plus, ni chez l'hébergeur ni dans le CAR publié sur IPFS. Rendre le document depuis le cache garantissait donc que ses sous-ressources partent en 404 : le premier affichage suivant chaque mise en ligne se faisait sans style ni script.

Le prix est un aller-retour réseau avant le premier rendu. Hors ligne il n'est pas payé — `fetch()` échoue immédiatement et le cache prend le relais.

> ⚠️ Ne jamais recréer `public/sw.js` : `public/` est recopié verbatim et le fichier masquerait la route, qui redeviendrait muette. `src/tests/serviceWorker.test.ts` interdit son retour.

## Inventaire des dépendances (SBOM)

Chaque run de `deploy.yml` produit un SBOM CycloneDX des dépendances de production, avec `npm sbom` (outil intégré à npm, rien d'installé en plus), et le publie comme artefact `sbom-cyclonedx` du run. Il ne fait pas partie du site publié. Pour le produire en local :

```bash
npm sbom --sbom-format cyclonedx --omit dev > sbom.cdx.json
```

## Tests

```bash
npm test            # Exécution unique
npm run test:watch  # Mode watch
```

Les tests couvrent les utilitaires purs (`alignment`, `validateConfig`, `ogTemplate`, dont les cas extrêmes exigés par la charte : message long, emoji, accents, RTL, CJK), la conformité des flux, le Service Worker, et les **invariants que la prose ne peut pas garantir** : jumelage des deux CSP, exactitude de l'arborescence ci-dessus, transit des secrets par `env:` dans les workflows.

Certains tests confrontent le code à `dist/`. Ils s'ignorent proprement quand le build est absent (`npm test` seul) et deviennent obligatoires quand on l'exige :

```bash
npm run build
W00_REQUIRE_DIST=1 npm run test:dist   # échoue si dist/ manque, au lieu de sauter
```

C'est le mode utilisé par `deploy.yml` après le build. Sans le drapeau, un `dist/` absent rendrait ces tests verts par omission — le pire des résultats, puisqu'il rassure.

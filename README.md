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

### Options d'alignement

| Champ | Valeurs acceptées |
|-------|------------------|
| `horizontalAlignment` | `left`, `center`, `right` |
| `verticalAlignment` | `top`, `center`, `bottom` |

La config est **validée au build** (`src/utils/validateConfig.ts`) — une valeur invalide provoque une erreur claire plutôt qu'un rendu silencieusement cassé.

## Ce que génère le site

| URL | Format | Usage |
|-----|--------|-------|
| `/` | HTML | Le mur : tous les panneaux, filtrables par tag |
| `/b/<id>/` | HTML | Une affiche par panneau — l'URL canonique à partager |
| `/og-image.png` | PNG 1200×630 | Aperçu pour les réseaux sociaux (premier panneau) |
| `/og/<id>.png` | PNG 1200×630 | Carte OG dédiée de chaque panneau |
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
│   ├── og/[id].png.ts              # Carte OG dédiée par panneau
│   ├── feed.xml.ts                 # Flux RSS
│   ├── feed.json.ts                # Flux JSON Feed 1.1
│   ├── llms.txt.ts                 # Résumé markdown pour les IA
│   ├── llms-full.txt.ts            # Contexte complet pour les IA
│   ├── sitemap.xml.ts              # Sitemap
│   └── og-image.png.ts             # Image OG 1200×630 (pré-rendue au build)
└── tests/
    ├── alignment.test.ts
    ├── ogTemplate.test.ts
    └── validateConfig.test.ts
scripts/
├── post-bluesky.mjs                # Publication Bluesky (AT Protocol)
└── post-nostr.mjs                  # Publication Nostr
public/
├── sw.js                           # Service Worker (offline + stale-while-revalidate)
├── _headers                        # En-têtes de sécurité Cloudflare Pages (CSP…)
└── robots.txt
.github/workflows/
├── deploy.yml                      # Tests + build + vérification des artefacts
├── broadcast.yml                   # Diffusion multi-protocoles au changement de config
└── lighthouse.yml                  # Audit Lighthouse CI (perf, a11y, SEO)
```

## Déploiement — Cloudflare Pages

Le site est **100 % statique** (`output: 'static'`). Cloudflare Pages surveille la branche `main` et déploie automatiquement chaque push sur **https://w00-board.pages.dev**. Le workflow `deploy.yml` sert de filet : tests, build et vérification que les fichiers critiques (`og-image.png`, flux, sitemap…) sont bien générés.

Les en-têtes de sécurité (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy) sont définis dans `public/_headers`.

> ⚠️ La CSP existe en **deux** endroits qui doivent rester synchronisés : la balise `<meta>` dans `src/layouts/Layout.astro` et `public/_headers`. Toute modification doit toucher les deux.

## Diffusion multi-protocoles

À chaque modification de `src/data/config.json` poussée sur `main`, le workflow `broadcast.yml` publie le message sur les réseaux configurés. Chaque canal est optionnel : **secret absent → canal ignoré avec un log, jamais d'échec**.

| Secret GitHub | Canal |
|---|---|
| `MASTODON_TOKEN`, `MASTODON_INSTANCE` | Mastodon (Fediverse) |
| `BLUESKY_HANDLE`, `BLUESKY_PASSWORD` | Bluesky (AT Protocol) |
| `NOSTR_PRIVATE_KEY` | Nostr |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Telegram (Bot sendMessage API) |
| `DISCORD_WEBHOOK_URL` | Discord (Webhook URL) |
| `SITE_URL` | URL canonique (défaut : `https://w00-board.pages.dev`) |


## Miroir IPFS

À chaque push sur `main`, le job `ipfs` de `deploy.yml` épingle le build sur IPFS et met à jour un pointeur IPNS **stable** :

- **Adresse stable** : `ipns://k51qzi5uqu5djx9q0h131lbqfu69gldfkmq97vpo5g2b0kcmywo7t388uji933`
- **Passerelle** : <https://dweb.link/ipns/k51qzi5uqu5djx9q0h131lbqfu69gldfkmq97vpo5g2b0kcmywo7t388uji933> (secours : `w3s.link`)
- **Historique public des CID** : branche [`ipfs-history`](https://github.com/johnallop/w00-board/tree/ipfs-history) (`CIDS.log`, hors `main`)

Le CID est calculé **localement** (`ipfs-car pack dist --no-wrap`) avant tout upload : le contenu est vérifiable et portable indépendamment du service de pinning.

### Setup (une seule fois)

1. **Storacha** (nécessite une vérification e-mail interactive — impossible en CI) :

   ```bash
   npm install -g @web3-storage/w3cli
   w3 login vous@exemple.com          # cliquer le lien reçu par e-mail
   w3 space create w00-board
   w3 key create                       # → did:key:... (public) + clé privée
   w3 delegation create <did:key:...> --base64
   ```

   Secrets GitHub à créer : `W3_PRINCIPAL` = la clé privée émise par `w3 key create`, `W3_PROOF` = la délégation base64.

2. **Clé IPNS (w3name)** :

   ```bash
   node scripts/generate-w3name-key.mjs
   ```

   Copier le contenu de `w3name-key.SECRET.txt` dans le secret GitHub `W3NAME_KEY`, puis **supprimer le fichier**. Ne jamais le committer (il est gitignoré). Ne jamais régénérer la clé : le nom public `k51...` (codé dans `src/data/ipfs.ts`) changerait et casserait tous les liens publiés.

Secrets absents → le job `ipfs` s'ignore proprement avec un log, le déploiement Cloudflare n'est jamais bloqué.

### Documentation du service (exigée par `AGENTS.md`)

- **Service** : [Storacha](https://storacha.network) (successeur de web3.storage), client `w3cli` et packer `ipfs-car` open source.
- **Coût / quotas** : free tier ≈ 5 Go (`À vérifier` lors du setup) — le site fait < 5 Mo par snapshot, marge très large.
- **Données envoyées** : uniquement le contenu déjà public du site (`dist/`). Aucune donnée personnelle.
- **Portabilité / stratégie de sortie** : le CID est calculé localement avant upload ; n'importe quel autre service de pinning (Pinata, Filebase) ou un nœud Kubo auto-hébergé peut resservir **le même CID à l'identique**. Changer de service = changer une seule commande d'upload dans le job.
- **Repli si w3name (IPNS) échoue** : le pin reste effectif et la branche `ipfs-history` donne toujours le dernier CID connu — l'étape IPNS est en `continue-on-error`.

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

Le Service Worker (`public/sw.js`) met en cache la page d'accueil au premier chargement. Les visites suivantes utilisent la stratégie **stale-while-revalidate** : réponse instantanée depuis le cache avec mise à jour silencieuse en arrière-plan.

## Tests

```bash
npm test            # Exécution unique
npm run test:watch  # Mode watch
```

Les tests couvrent les utilitaires `alignment`, `validateConfig` et `ogTemplate` (dont les cas extrêmes exigés par la charte : message long, emoji, accents, RTL, CJK).

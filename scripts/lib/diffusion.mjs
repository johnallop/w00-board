/**
 * Les deux garanties de la voie de diffusion : ce qu'on refuse de publier, et
 * ce qui compte comme un succès.
 *
 * Pourquoi ce module existe alors que `src/utils/validateConfig.ts` valide déjà
 * la config : ce validateur-là s'exécute au BUILD. Or `broadcast.yml` ne build
 * pas — il fait `npm ci` puis lance directement `scripts/broadcast.mjs`. Une
 * config que le build refuserait pouvait donc être diffusée sur cinq
 * plateformes publiques sans qu'aucun contrôle ne s'exécute. En mode `--prev`,
 * la config vient en plus d'un `git show` sur un commit arbitraire de
 * l'historique.
 *
 * Ce module ne duplique PAS validateConfig : il ne contrôle que les quatre
 * champs que la diffusion consomme réellement (`id`, `message`, `author`,
 * `tags`), plus `SITE_URL`. Les couleurs, le thème et la mise en page ne
 * quittent jamais le build — les valider ici ne ferait qu'ajouter deux sources
 * de vérité à faire diverger.
 *
 * Fonctions pures, sans I/O — testées dans src/tests/diffusion.test.ts.
 */

/*
 * Doit rester identique au contrôle de `validateConfig.ts` (« billboards[].id »).
 * Un id devient un segment de chemin dans l'URL publiée sur cinq plateformes :
 * `${siteUrl}/b/${board.id}/`. Le test `src/tests/diffusion.test.ts` compare
 * les deux expressions pour que la divergence échoue au lieu de passer.
 */
export const ID_URL_SAFE = /^[a-z0-9-_]+$/i;

/**
 * Refuse un panneau que la diffusion ne doit pas publier.
 *
 * @param {unknown} board — le panneau tel que lu dans le JSON
 * @param {string} contexte — préfixe de message d'erreur (ex. « billboards[2] »)
 * @returns {object} le panneau, si et seulement s'il est diffusable
 */
export function validerPanneauDiffusable(board, contexte = 'panneau') {
  if (!board || typeof board !== 'object' || Array.isArray(board)) {
    throw new Error(`${contexte} : doit être un objet`);
  }
  if (typeof board.id !== 'string' || !ID_URL_SAFE.test(board.id)) {
    throw new Error(
      `${contexte} : "id" doit être URL-safe (lettres, chiffres, tirets, underscores) — reçu ${JSON.stringify(board.id)}. Cette valeur devient un segment de l'URL diffusée publiquement.`
    );
  }
  for (const champ of ['message', 'author']) {
    if (typeof board[champ] !== 'string' || board[champ].trim() === '') {
      throw new Error(`${contexte} (${board.id}) : "${champ}" doit être une chaîne non vide`);
    }
  }
  if (board.tags !== undefined) {
    if (!Array.isArray(board.tags) || board.tags.some((t) => typeof t !== 'string')) {
      throw new Error(`${contexte} (${board.id}) : "tags" doit être un tableau de chaînes`);
    }
  }
  return board;
}

/**
 * Normalise et contrôle `SITE_URL`. C'est la seule donnée d'environnement qui
 * finisse telle quelle dans le corps des messages publiés ; une valeur absurde
 * n'échouerait nulle part, elle diffuserait juste un lien mort à tout le monde.
 *
 * @param {unknown} valeur
 * @returns {string} l'origine normalisée, sans barre oblique finale
 */
export function validerSiteUrl(valeur) {
  if (typeof valeur !== 'string' || valeur.trim() === '') {
    throw new Error('SITE_URL : doit être une chaîne non vide');
  }
  let u;
  try {
    u = new URL(valeur);
  } catch {
    throw new Error(`SITE_URL : « ${valeur} » n'est pas une URL absolue valide (ex. https://board.wooddyviat.com)`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error(`SITE_URL : protocole « ${u.protocol} » refusé, seuls http et https sont diffusables`);
  }
  return (u.origin + u.pathname).replace(/\/$/, '');
}

/**
 * Traduit le résultat par canal en code de sortie de processus.
 *
 * Ce que ça corrige : l'orchestrateur attrapait chaque erreur de canal, la
 * journalisait, puis continuait — et `main()` se résolvait normalement. Les
 * cinq canaux pouvaient échouer, ou n'être configurés nulle part, le processus
 * sortait 0 et le workflow s'affichait vert. Un heartbeat hebdomadaire qui
 * n'avait rien publié était indistinguable d'un heartbeat réussi.
 *
 * `post-nostr.mjs` applique déjà cette règle un étage plus bas
 * (`if (published === 0) throw`) : on la remonte simplement à l'orchestrateur.
 *
 * @param {Array<{canal: string, etat: 'publie'|'echec'|'absent'|'simule'}>} resultats
 * @returns {{code: 0|1, resume: string}}
 */
export function verdictDiffusion(resultats) {
  const parEtat = (etat) => resultats.filter((r) => r.etat === etat);
  const publies = parEtat('publie');
  const simules = parEtat('simule');
  const echecs = parEtat('echec');
  const absents = parEtat('absent');

  const noms = (liste) => liste.map((r) => r.canal).join(', ');
  const morceaux = [];
  if (publies.length) morceaux.push(`${publies.length} publié(s) : ${noms(publies)}`);
  if (simules.length) morceaux.push(`${simules.length} simulé(s) : ${noms(simules)}`);
  if (echecs.length) morceaux.push(`${echecs.length} en échec : ${noms(echecs)}`);
  if (absents.length) morceaux.push(`${absents.length} non configuré(s) : ${noms(absents)}`);
  const resume = morceaux.length ? morceaux.join(' | ') : 'aucun canal';

  if (echecs.length > 0) {
    return { code: 1, resume: `${resume} — au moins un canal configuré a échoué` };
  }
  /*
   * Zéro canal atteint est un échec, pas un succès silencieux. Un canal
   * « absent » (secret manquant) reste toléré tant qu'un autre a publié : la
   * configuration partielle est un choix légitime. Tous absents ne l'est pas —
   * on a demandé une diffusion et personne ne l'a reçue.
   */
  if (publies.length === 0 && simules.length === 0) {
    return { code: 1, resume: `${resume} — aucun canal n'a reçu le message` };
  }
  return { code: 0, resume };
}

/**
 * Attend que le site serve les panneaux à diffuser, en lisant `/build.json`.
 *
 * Ce que ça corrige : broadcast.yml se déclenche au push, en parallèle de
 * Cloudflare Pages qui construit le même commit. Un panneau AJOUTÉ était donc
 * annoncé sur huit réseaux avec un lien encore en 404, et un panneau MODIFIÉ
 * avec l'ancienne image d'aperçu — que les plateformes mettent ensuite en
 * cache.
 *
 * POURQUOI LE CONTENU ET NON LE COMMIT. La première version attendait que
 * `build.json` porte exactement GITHUB_SHA. Deux pushs rapprochés suffisaient
 * à la bloquer : Cloudflare publie le second, le commit attendu n'apparaît
 * jamais, la diffusion du premier expire et s'annule — alors que son panneau
 * était bel et bien en ligne. La question réelle n'est pas « quel commit est
 * déployé ? » mais « ce que j'annonce est-il servi tel quel ? ». `build.json`
 * publie la forme canonique de chaque panneau (canonicalizeBillboard) : on
 * exige que chaque panneau à diffuser y figure à l'identique. Un déploiement
 * plus récent qui l'a laissé intact débloque la diffusion ; un déploiement qui
 * l'a modifié entre-temps ne la débloque pas — c'est alors le push suivant,
 * avec son propre diff, qui annonce la version à jour.
 *
 * Dépendances injectées (fetch, sleep, horloge) : la fonction se teste sans
 * réseau ni attente réelle.
 *
 * @param {object} o
 * @param {string} o.siteUrl
 * @param {string[]} o.canoniques — forme canonique de chaque panneau à diffuser
 * @param {typeof fetch} [o.fetch]
 * @param {(ms: number) => Promise<void>} [o.sleep]
 * @param {() => number} [o.maintenant]
 * @param {number} [o.delaiMax] — ms, défaut 10 min
 * @param {number} [o.intervalle] — ms, défaut 15 s
 * @param {(ligne: string) => void} [o.journal]
 * @returns {Promise<{enLigne: boolean, vu: string | null, manquants: string[]}>}
 *   `vu` : commit annoncé par le site (journal) ; `manquants` : canoniques absents
 */
export async function attendreDeploiement({
  siteUrl,
  canoniques,
  fetch: recuperer = globalThis.fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  maintenant = Date.now,
  delaiMax = 10 * 60 * 1000,
  intervalle = 15 * 1000,
  journal = () => {},
}) {
  const debut = maintenant();
  let vu = null;
  let manquants = [...canoniques];
  for (;;) {
    try {
      const reponse = await recuperer(`${siteUrl}/build.json`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      if (reponse.ok) {
        const donnees = await reponse.json();
        vu = typeof donnees?.commit === 'string' ? donnees.commit : null;
        const servis = new Set(
          (Array.isArray(donnees?.fingerprints?.billboards) ? donnees.fingerprints.billboards : [])
            .map((b) => b?.canonical)
            .filter((c) => typeof c === 'string')
        );
        manquants = canoniques.filter((c) => !servis.has(c));
        if (manquants.length === 0) return { enLigne: true, vu, manquants };
        journal(`déployé : ${vu ?? 'inconnu'} | ${manquants.length} panneau(x) pas encore servi(s) à l'identique`);
      } else {
        journal(`build.json répond ${reponse.status}`);
      }
    } catch (err) {
      journal(`build.json injoignable : ${err instanceof Error ? err.message : String(err)}`);
    }
    if (maintenant() - debut + intervalle > delaiMax) return { enLigne: false, vu, manquants };
    await sleep(intervalle);
  }
}

/**
 * Clé d'idempotence d'une publication.
 *
 * Un « Re-run » GitHub garde le même GITHUB_RUN_ID (seul GITHUB_RUN_ATTEMPT
 * change) : la clé est donc identique d'une tentative à l'autre, et les canaux
 * qui savent dédoublonner (Mastodon via Idempotency-Key, gardée 1 h ; Matrix
 * via l'identifiant de transaction) ignorent la seconde. Un nouveau
 * déclenchement a un autre run id, donc une autre clé : rien n'est bloqué à
 * tort.
 *
 * @param {{id: string}} board
 * @param {string | undefined} runId
 * @param {boolean} repost
 * @returns {string}
 */
export function cleIdempotence(board, runId, repost) {
  return `w00-${board.id}-${repost ? 'repost' : 'post'}-${runId || 'local'}`;
}

/**
 * Restreint la diffusion aux canaux nommés, pour rejouer seulement ceux qui
 * ont échoué au lieu de republier partout (variable CANAUX, ex. « nostr,matrix »).
 * Vide ou absent : tous les canaux.
 *
 * @param {string[]} disponibles
 * @param {string | undefined} valeur
 * @returns {string[]}
 */
export function filtrerCanaux(disponibles, valeur) {
  if (!valeur || valeur.trim() === '') return [...disponibles];
  const demandes = valeur.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
  const inconnus = demandes.filter((c) => !disponibles.includes(c));
  if (inconnus.length > 0) {
    throw new Error(`CANAUX : canal inconnu « ${inconnus.join(', ')} » — attendus : ${disponibles.join(', ')}`);
  }
  return disponibles.filter((c) => demandes.includes(c));
}

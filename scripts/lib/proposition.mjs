/**
 * Proposer un panneau sans toucher au dépôt : le contrat partagé entre la page
 * /creer/ (qui fabrique la proposition) et le workflow propose.yml (qui la
 * transforme en pull request quand un mainteneur l'approuve).
 *
 * Pourquoi une issue GitHub plutôt qu'un formulaire qui écrit directement :
 * le site est 100 % statique. Écrire dans `config.json` depuis le navigateur
 * exigerait une fonction serveur détenant un jeton d'écriture sur le dépôt —
 * soit une authentification à construire, soit un jeton exposé. L'issue donne
 * gratuitement l'identité du proposant, la modération (seul un compte ayant le
 * droit « triage » peut poser un label) et un historique public.
 *
 * Le même module tourne dans le navigateur (bundlé par Vite) et dans Node
 * (scripts/propose-board.mjs) : aucune API propre à l'un ou à l'autre.
 *
 * Ce module ne remplace PAS validateConfig : il borne ce qu'une proposition
 * publique peut contenir (longueurs, forme), puis la PR passe par le build, qui
 * applique toutes les règles du dépôt (contraste WCAG, unicité de l'id…).
 */

/** Bornes d'une proposition publique. Le build n'en impose pas, la modération si. */
export const LIMITES = Object.freeze({
  message: 280,
  author: 60,
  tags: 5,
  tag: 30,
  id: 48,
});

/** Label posé automatiquement par le lien de proposition (si le proposant en a le droit). */
export const LABEL_PROPOSITION = 'proposition-panneau';

/** Label que SEUL un mainteneur pose pour déclencher la création de la PR. */
export const LABEL_APPROBATION = 'panneau-approuve';

/** Même expression que validateConfig.ts et diffusion.mjs (ID_URL_SAFE). */
const ID_VALIDE = /^[a-z0-9-_]+$/i;
const COULEUR_HEX6 = /^#[0-9a-f]{6}$/i;

/** Marqueurs qui délimitent le bloc lu par le workflow dans le corps de l'issue. */
const DEBUT_BLOC = '```json';
const FIN_BLOC = '```';

/**
 * Identifiant d'URL dérivé d'un texte : « Jésus t'aime ! » → « jesus-t-aime ».
 * @param {string} texte
 * @returns {string}
 */
export function slugifier(texte) {
  const slug = String(texte)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITES.id)
    .replace(/-+$/g, '');
  return slug || 'panneau';
}

/** Longueur perçue (graphèmes approximés par points de code) — un emoji compte pour un. */
function longueur(texte) {
  return [...texte].length;
}

/**
 * Nettoie et contrôle une proposition brute. Lève une erreur qui nomme le
 * champ, la valeur reçue et ce qui est attendu.
 *
 * @param {unknown} brut
 * @returns {{id: string, message: string, author: string, tags?: string[], accentColor?: string}}
 */
export function normaliserProposition(brut) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) {
    throw new Error('Proposition : un objet JSON est attendu ({ "message": …, "author": … }).');
  }
  const b = /** @type {Record<string, unknown>} */ (brut);

  const texte = (champ, max) => {
    const v = b[champ];
    if (typeof v !== 'string' || v.trim() === '') {
      throw new Error(
        `Proposition : "${champ}" doit être un texte non vide (reçu ${JSON.stringify(v)}).`,
      );
    }
    const propre = v.trim().replace(/\s+/g, ' ');
    if (longueur(propre) > max) {
      throw new Error(
        `Proposition : "${champ}" fait ${longueur(propre)} caractères, ${max} au plus.`,
      );
    }
    return propre;
  };

  const message = texte('message', LIMITES.message);
  const author = texte('author', LIMITES.author);

  const idBrut = b.id === undefined || b.id === '' ? slugifier(message) : b.id;
  if (typeof idBrut !== 'string' || !ID_VALIDE.test(idBrut) || idBrut.length > LIMITES.id) {
    throw new Error(
      `Proposition : "id" (${JSON.stringify(idBrut)}) doit contenir uniquement lettres, chiffres, tirets et underscores, ${LIMITES.id} caractères au plus.`,
    );
  }

  /** @type {{id: string, message: string, author: string, tags?: string[], accentColor?: string}} */
  const panneau = { id: idBrut.toLowerCase(), message, author };

  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags) || b.tags.some((t) => typeof t !== 'string')) {
      throw new Error('Proposition : "tags" doit être une liste de textes.');
    }
    // Un tag devient un hashtag à la diffusion : espaces et « # » retirés ici
    // plutôt qu'au moment de publier, pour que le mur affiche la même chose.
    const tags = [...new Set(b.tags.map((t) => t.replace(/[#\s]+/g, '')).filter(Boolean))];
    if (tags.length > LIMITES.tags) {
      throw new Error(`Proposition : ${tags.length} tags, ${LIMITES.tags} au plus.`);
    }
    const tropLong = tags.find((t) => longueur(t) > LIMITES.tag);
    if (tropLong) {
      throw new Error(`Proposition : le tag « ${tropLong} » dépasse ${LIMITES.tag} caractères.`);
    }
    if (tags.length > 0) panneau.tags = tags;
  }

  if (b.accentColor !== undefined && b.accentColor !== '') {
    if (typeof b.accentColor !== 'string' || !COULEUR_HEX6.test(b.accentColor)) {
      throw new Error(
        `Proposition : "accentColor" (${JSON.stringify(b.accentColor)}) doit être une couleur #rrggbb.`,
      );
    }
    panneau.accentColor = b.accentColor.toLowerCase();
  }

  return panneau;
}

/**
 * Corps Markdown de l'issue. Le bloc JSON est la seule partie lue par la
 * machine ; le reste s'adresse au mainteneur qui modère.
 *
 * @param {ReturnType<typeof normaliserProposition>} panneau
 * @returns {string}
 */
export function corpsIssue(panneau) {
  return [
    'Proposition de panneau envoyée depuis la page /creer/.',
    '',
    `> ${panneau.message}`,
    `> — ${panneau.author}`,
    '',
    DEBUT_BLOC,
    JSON.stringify(panneau, null, 2),
    FIN_BLOC,
    '',
    `Modération : poser le label \`${LABEL_APPROBATION}\` ouvre automatiquement une pull request qui ajoute ce panneau à \`src/data/config.json\`. Le build de la PR applique toutes les règles du dépôt (contraste, unicité de l'id). Rien n'est publié avant la fusion.`,
  ].join('\n');
}

/**
 * Lien « nouvelle issue » prérempli. Le paramètre `labels` n'est appliqué par
 * GitHub que si le proposant a le droit de poser des labels ; sinon il est
 * ignoré sans erreur, d'où le label d'approbation séparé et réservé.
 *
 * @param {string} depotUrl — ex. https://github.com/owner/repo
 * @param {ReturnType<typeof normaliserProposition>} panneau
 * @returns {string}
 */
export function urlIssue(depotUrl, panneau) {
  const params = new URLSearchParams({
    title: `Proposition de panneau : ${panneau.message}`.slice(0, 120),
    body: corpsIssue(panneau),
    labels: LABEL_PROPOSITION,
  });
  return `${depotUrl.replace(/\/$/, '')}/issues/new?${params.toString()}`;
}

/**
 * Lit la proposition dans le corps d'une issue. Seul le PREMIER bloc ```json
 * compte : un commentaire ou une édition qui en ajoute un second ne détourne
 * pas la proposition.
 *
 * @param {unknown} corps
 * @returns {ReturnType<typeof normaliserProposition>}
 */
export function extraireProposition(corps) {
  if (typeof corps !== 'string') {
    throw new Error('Issue : le corps est vide, aucune proposition à lire.');
  }
  const texte = corps.replace(/\r\n/g, '\n');
  const debut = texte.indexOf(`${DEBUT_BLOC}\n`);
  if (debut === -1) {
    throw new Error(
      'Issue : aucun bloc ```json trouvé. Utilisez la page /creer/ pour générer la proposition.',
    );
  }
  const contenu = texte.slice(debut + DEBUT_BLOC.length + 1);
  const fin = contenu.indexOf(`\n${FIN_BLOC}`);
  if (fin === -1) {
    throw new Error('Issue : le bloc ```json n’est pas refermé.');
  }
  let brut;
  try {
    brut = JSON.parse(contenu.slice(0, fin));
  } catch (err) {
    throw new Error(
      `Issue : le bloc JSON est illisible (${err instanceof Error ? err.message : String(err)}).`,
    );
  }
  return normaliserProposition(brut);
}

/**
 * Sérialise la config dans le format du fichier versionné : indentation de
 * deux espaces, tableaux de valeurs simples sur une ligne (`"tags": ["Paix",
 * "Foi"]`). `JSON.stringify(c, null, 2)` dépliait chaque tag sur sa propre
 * ligne : la PR d'un seul panneau aurait réécrit tout le fichier, et la relecture
 * humaine — la seule modération — aurait eu à chercher l'ajout dans le bruit.
 *
 * @param {unknown} valeur
 * @param {string} [retrait]
 * @returns {string}
 */
export function serialiserConfig(valeur, retrait = '') {
  const suivant = `${retrait}  `;
  if (Array.isArray(valeur)) {
    if (valeur.length === 0) return '[]';
    if (valeur.every((v) => v === null || typeof v !== 'object')) {
      return `[${valeur.map((v) => JSON.stringify(v)).join(', ')}]`;
    }
    return `[\n${valeur.map((v) => suivant + serialiserConfig(v, suivant)).join(',\n')}\n${retrait}]`;
  }
  if (valeur !== null && typeof valeur === 'object') {
    const entrees = Object.entries(valeur).filter(([, v]) => v !== undefined);
    if (entrees.length === 0) return '{}';
    const lignes = entrees.map(
      ([k, v]) => `${suivant}${JSON.stringify(k)}: ${serialiserConfig(v, suivant)}`,
    );
    return `{\n${lignes.join(',\n')}\n${retrait}}`;
  }
  return JSON.stringify(valeur);
}

/**
 * Nouvelle config avec le panneau ajouté EN FIN de mur. Pas en tête :
 * `billboards[0]` porte l'identité du site (image OG d'accueil, JSON-LD,
 * description par défaut), qu'une proposition publique ne doit pas remplacer.
 * L'objet reçu n'est pas modifié.
 *
 * @param {{billboards: Array<{id: string}>}} config
 * @param {ReturnType<typeof normaliserProposition>} panneau
 * @param {string} dateIso — date de publication, ISO 8601 avec fuseau
 * @returns {object}
 */
export function ajouterPanneau(config, panneau, dateIso) {
  if (!config || !Array.isArray(config.billboards)) {
    throw new Error('config.json : "billboards" doit être un tableau.');
  }
  if (config.billboards.some((b) => b.id === panneau.id)) {
    throw new Error(
      `Un panneau d'id « ${panneau.id} » existe déjà : choisissez un autre identifiant.`,
    );
  }
  return { ...config, billboards: [...config.billboards, { ...panneau, date: dateIso }] };
}

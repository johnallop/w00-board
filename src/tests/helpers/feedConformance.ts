/*
 * Contrôleurs de conformité des flux, partagés entre deux points d'entrée.
 *
 * Ils étaient jusqu'ici locaux à feedXml.test.ts et feedJson.test.ts, qui
 * appellent les routes `GET()` directement. Ce module existe parce qu'un second
 * appelant est apparu : distArtefacts.test.ts, qui les rejoue sur les octets
 * réellement écrits dans dist/, après passage de @playform/compress.
 *
 * Le partage est délibéré et sa limite est connue : si un contrôleur est faux,
 * les deux appelants se trompent ensemble. Mais toute divergence constatée entre
 * `GET()` et dist/ ne peut alors venir que du post-traitement — ce qui est
 * exactement ce que le second appelant cherche à mesurer.
 */

// ---------------------------------------------------------------------------
// JSON Feed 1.1 — https://www.jsonfeed.org/version/1.1/
// ---------------------------------------------------------------------------

/**
 * Clés admises par la spec, indexées par sorte d'objet.
 *
 * L'indexation par sorte n'est pas du zèle : la validité d'une clé est
 * positionnelle. `url` est légal sur un item, un auteur, une pièce jointe ou un
 * hub, mais illégal à la racine — qui utilise `home_page_url` et `feed_url`.
 * Une liste unique et plate accepterait un `url` racine dénué de sens.
 */
const ALLOWED: Record<string, Set<string>> = {
  feed: new Set([
    'version', 'title', 'home_page_url', 'feed_url', 'description', 'user_comment',
    'next_url', 'icon', 'favicon', 'authors', 'author', 'language', 'expired', 'hubs', 'items',
  ]),
  item: new Set([
    'id', 'url', 'external_url', 'title', 'content_html', 'content_text', 'summary',
    'image', 'banner_image', 'date_published', 'date_modified', 'authors', 'author',
    'tags', 'language', 'attachments',
  ]),
  author: new Set(['name', 'url', 'avatar']),
  attachment: new Set(['url', 'mime_type', 'title', 'size_in_bytes', 'duration_in_seconds']),
  hub: new Set(['type', 'url']),
};

/** Sorte d'objet dans laquelle on descend, selon la clé traversée. */
const CHILDREN: Record<string, Record<string, string>> = {
  feed: { items: 'item', authors: 'author', author: 'author', hubs: 'hub' },
  item: { authors: 'author', author: 'author', attachments: 'attachment' },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Contrôle le contenu d'un objet d'extension (clé préfixée `_`).
 *
 * La spec laisse ce contenu entièrement libre : elle n'impose que le préfixe sur
 * la clé porteuse. Ne rien contrôler est donc le comportement fidèle — mais cela
 * revient à traiter `_w00_board` comme un détail interne, alors que
 * `/llms-full.txt` et `/verifier/` le documentent comme un format publié.
 *
 * TODO(contribution): arbitrer si la forme de `_w00_board` est un contrat.
 */
function extensionViolations(path: string, value: unknown): string[] {
  // Branche permissive, conforme à la spec et volontairement sans effet.
  void path;
  void value;
  return [];
}

/**
 * Clés qui ne sont ni dans la spec ni déclarées comme extension.
 *
 * La règle de la spec : toute clé non standard doit commencer par `_` et porter
 * au moins un caractère ensuite. C'est exactement ce qui rend une extension
 * ignorable sans dommage par un lecteur conforme.
 */
export function nonConformingKeys(node: unknown, kind = 'feed', path = ''): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((entry, i) => nonConformingKeys(entry, kind, `${path}[${i}]`));
  }
  if (!isPlainObject(node)) return [];

  const violations: string[] = [];

  for (const [key, value] of Object.entries(node)) {
    const here = path ? `${path}.${key}` : key;

    if (key.startsWith('_')) {
      if (key.length === 1) violations.push(`${here} — extension sans nom après le préfixe`);
      else violations.push(...extensionViolations(here, value));
      continue;
    }

    if (!ALLOWED[kind].has(key)) {
      violations.push(`${here} — clé absente de la spec pour un objet « ${kind} », et non préfixée par _`);
      continue;
    }

    const childKind = CHILDREN[kind]?.[key];
    if (childKind) violations.push(...nonConformingKeys(value, childKind, here));
  }

  return violations;
}

// ---------------------------------------------------------------------------
// XML / RSS
// ---------------------------------------------------------------------------

/** Préfixes utilisables sans déclaration, réservés par la spec XML. */
const IMPLICIT_PREFIXES = new Set(['xml', 'xmlns']);

interface Tag {
  name: string;
  attributes: string[];
  closing: boolean;
  selfClosing: boolean;
}

/** Retire commentaires, CDATA, instructions de traitement et doctype. */
function stripNonElements(xml: string): string {
  return xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '');
}

/**
 * Découpe le document en balises.
 *
 * Le motif tolère `>` à l'intérieur d'une valeur d'attribut guillemetée, cas que
 * `<[^>]*>` découperait au mauvais endroit. Il ne prétend pas remplacer un
 * analyseur XML : il ne sert qu'aux deux propriétés vérifiées ici.
 */
function tokenize(xml: string): Tag[] {
  const tagPattern = /<(\/?)([^\s/>]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const attrPattern = /([^\s=/]+)\s*=\s*(?:"[^"]*"|'[^']*')/g;
  const tags: Tag[] = [];

  for (const match of stripNonElements(xml).matchAll(tagPattern)) {
    const [, slash, name, rawAttributes, selfSlash] = match;
    tags.push({
      name,
      attributes: Array.from(rawAttributes.matchAll(attrPattern), (a) => a[1]),
      closing: slash === '/',
      selfClosing: selfSlash === '/',
    });
  }

  return tags;
}

/** Préfixe d'un nom qualifié, ou `null` si le nom n'en porte pas. */
function prefixOf(qualifiedName: string): string | null {
  const colon = qualifiedName.indexOf(':');
  return colon > 0 ? qualifiedName.slice(0, colon) : null;
}

/**
 * Préfixes de namespace employés sans déclaration correspondante.
 *
 * Limite assumée : les déclarations sont traitées comme globales, sans suivi de
 * portée. Un préfixe déclaré sur un élément profond et utilisé ailleurs passerait
 * donc au travers. C'est plus permissif que la spec, mais cela couvre le défaut
 * qui nous occupe — un préfixe déclaré nulle part — sans réimplémenter la
 * résolution de portée pour un flux dont tout est déclaré sur `<rss>`.
 */
export function undeclaredPrefixes(xml: string): string[] {
  const declared = new Set(IMPLICIT_PREFIXES);
  const used = new Set<string>();

  for (const tag of tokenize(xml)) {
    const elementPrefix = prefixOf(tag.name);
    if (elementPrefix) used.add(elementPrefix);

    for (const attribute of tag.attributes) {
      const attributePrefix = prefixOf(attribute);
      if (!attributePrefix) continue;
      // `xmlns:foo="…"` déclare `foo` ; il n'utilise pas le préfixe `xmlns`.
      if (attributePrefix === 'xmlns') declared.add(attribute.slice('xmlns:'.length));
      else used.add(attributePrefix);
    }
  }

  return [...used].filter((prefix) => !declared.has(prefix)).sort();
}

/** Balises ouvertes jamais refermées, ou refermées dans le désordre. */
export function unbalancedTags(xml: string): string[] {
  const stack: string[] = [];
  const errors: string[] = [];

  for (const tag of tokenize(xml)) {
    if (tag.selfClosing) continue;
    if (!tag.closing) {
      stack.push(tag.name);
      continue;
    }
    const opened = stack.pop();
    if (opened !== tag.name) errors.push(`</${tag.name}> ferme <${opened ?? 'rien'}>`);
  }

  return [...errors, ...stack.map((name) => `<${name}> jamais refermée`)];
}

/** Décode les cinq entités XML. `&amp;` en dernier, sinon on décode deux fois. */
function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Contenu textuel de chaque occurrence d'un élément, entités décodées. */
export function textOf(xml: string, element: string): string[] {
  const pattern = new RegExp(`<${element}\\b[^>]*>([^<]*)</${element}>`, 'g');
  return Array.from(xml.matchAll(pattern), (m) => decodeXml(m[1]));
}

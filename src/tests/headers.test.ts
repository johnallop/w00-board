import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHEMIN_MANIFESTE } from '../utils/precacheManifeste';

/*
 * Pourquoi ce fichier existe.
 *
 * La CSP du site est écrite DEUX FOIS, à la main : dans le <meta> de
 * Layout.astro et dans public/_headers. Le README le signale depuis toujours
 * (« toute modification doit toucher les deux ») — mais une consigne en prose
 * n'est pas une garde. Jusqu'ici, RIEN dans le dépôt ne lisait public/_headers :
 * ni test, ni script, ni workflow. Le fichier partait en production sans avoir
 * jamais été regardé par autre chose qu'un humain attentif.
 *
 * Et la dérive ne se punirait pas là où on l'attend. Les politiques CSP sont
 * INTERSECTIVES : quand plusieurs s'appliquent, le navigateur exige de
 * satisfaire toutes. Une divergence n'ouvre donc jamais une faille — elle CASSE
 * LA PAGE, en bloquant une source qu'un seul des deux fichiers autorise. Pire,
 * elle la casse de façon invisible ici : `astro dev` et `astro preview` ne
 * servent pas public/_headers, seul Cloudflare Pages le fait. Le premier
 * témoin serait un visiteur devant une page morte.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIST = join(ROOT, 'dist');
const HEADERS_SOURCE = join(ROOT, 'public', '_headers');
const LAYOUT = join(ROOT, 'src', 'layouts', 'Layout.astro');

const REQUIRE_DIST = process.env.W00_REQUIRE_DIST === '1';
const DIST_PRESENT = existsSync(join(DIST, '_headers'));

if (REQUIRE_DIST && !DIST_PRESENT) {
  throw new Error(
    'W00_REQUIRE_DIST=1 mais dist/_headers est absent : lancer `npm run build` avant ce test.'
  );
}

// ─────────────────────────── lecture de _headers ───────────────────────────

type Regle = { motif: string; entetes: Map<string, string> };

/**
 * Le format Cloudflare Pages : une ligne non indentée ouvre un motif de chemin,
 * les lignes indentées qui suivent sont ses en-têtes, « # » commente.
 *
 * On l'analyse plutôt que de chercher des motifs dans le blob, parce qu'un
 * `includes('nosniff')` serait vrai même si l'en-tête était rattaché au mauvais
 * chemin, ou commenté. Ici, un en-tête mal placé lève.
 */
function analyserHeaders(brut: string): Regle[] {
  const regles: Regle[] = [];

  for (const ligne of brut.split(/\r?\n/)) {
    if (!ligne.trim() || ligne.trimStart().startsWith('#')) continue;

    if (!/^\s/.test(ligne)) {
      regles.push({ motif: ligne.trim(), entetes: new Map() });
      continue;
    }

    const courante = regles.at(-1);
    if (!courante) {
      throw new Error(`_headers : « ${ligne.trim()} » est indenté mais aucun motif ne le précède.`);
    }

    const separateur = ligne.indexOf(':');
    if (separateur === -1) {
      throw new Error(`_headers : ligne indentée sans « : » — « ${ligne.trim()} »`);
    }

    courante.entetes.set(ligne.slice(0, separateur).trim(), ligne.slice(separateur + 1).trim());
  }

  return regles;
}

/**
 * Les en-têtes effectivement servis pour un chemin.
 *
 * Cloudflare CUMULE les règles qui correspondent, au lieu que la plus précise
 * remplace la plus large — d'où l'accumulation dans l'ordre du fichier. C'est
 * cette sémantique qui permet d'ajouter un Cache-Control étroit sans reperdre
 * les en-têtes de sécurité du bloc `/*`, et un test ci-dessous s'en assure.
 */
function entetesPour(regles: Regle[], chemin: string): Map<string, string> {
  const cumul = new Map<string, string>();
  for (const regle of regles) {
    const correspond = regle.motif.endsWith('/*')
      ? chemin.startsWith(regle.motif.slice(0, -1))
      : regle.motif === chemin;
    if (correspond) for (const [nom, valeur] of regle.entetes) cumul.set(nom, valeur);
  }
  return cumul;
}

const REGLES = analyserHeaders(readFileSync(HEADERS_SOURCE, 'utf8'));

// ────────────────────────────── lecture des CSP ──────────────────────────────

/**
 * Une CSP en dictionnaire { directive → sources triées }.
 *
 * Le tri n'est pas de la coquetterie : pour le navigateur les sources d'une
 * directive forment un ENSEMBLE, pas une liste. Sans tri, réordonner deux
 * sources identiques ferait rougir ce fichier pour une différence qui n'en est
 * pas une — et un test qui crie à tort finit par être ignoré à raison.
 */
function analyserCsp(politique: string): Record<string, string> {
  const directives: Record<string, string> = {};
  for (const morceau of politique.split(';')) {
    const jetons = morceau.trim().split(/\s+/).filter(Boolean);
    if (jetons.length === 0) continue;
    directives[jetons[0]] = jetons.slice(1).sort().join(' ');
  }
  return directives;
}

/**
 * La CSP du <meta>, ou une erreur bruyante.
 *
 * Le `throw` est le cœur de la garde. Si Layout.astro change de forme et que
 * cette extraction rende `''` ou `{}`, la comparaison ci-dessous passerait au
 * vert en ne comparant plus rien : une garde décorative, pire que pas de garde,
 * puisqu'elle rassure. Mieux vaut échouer sur « je ne sais plus lire » que
 * prétendre « c'est cohérent ».
 */
function cspDuMeta(): string {
  const html = readFileSync(LAYOUT, 'utf8');
  const trouve = /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i.exec(html);

  if (!trouve) {
    throw new Error(
      'Aucun <meta http-equiv="Content-Security-Policy"> lisible dans Layout.astro. ' +
        'Soit la CSP a disparu de la page, soit sa forme a changé : dans les deux cas ' +
        'cette garde ne compare plus rien et doit être réparée avant d’être crue.'
    );
  }

  return trouve[1];
}

/**
 * Ce qu'un <meta> ne peut pas porter, par spécification.
 *
 * Le navigateur IGNORE ces directives quand elles arrivent par balise. Les
 * recopier dans le <meta> pour « aligner les deux fichiers » produirait une
 * symétrie visuelle et zéro protection — de la fausse assurance, exactement ce
 * que ce fichier existe pour empêcher. La bonne exigence n'est donc pas
 * l'égalité, c'est l'égalité modulo cette liste.
 */
const IGNOREES_EN_META = ['frame-ancestors', 'report-uri', 'report-to', 'sandbox'];

// ──────────────────────────────────  tests  ──────────────────────────────────

describe('public/_headers', () => {
  it('déclare le bloc large et ses en-têtes de sécurité', () => {
    const larges = entetesPour(REGLES, '/');
    expect(larges.get('X-Content-Type-Options')).toBe('nosniff');
    expect(larges.get('X-Frame-Options')).toBe('DENY');
    expect(larges.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(larges.get('Permissions-Policy')).toBeDefined();
  });
});

describe('la CSP est écrite deux fois et doit dire la même chose', () => {
  it('porte les mêmes directives des deux côtés, hors celles qu’un <meta> ne peut pas porter', () => {
    const desEntetes = analyserCsp(entetesPour(REGLES, '/').get('Content-Security-Policy') ?? '');
    const duMeta = analyserCsp(cspDuMeta());

    for (const ignoree of IGNOREES_EN_META) delete desEntetes[ignoree];

    expect(
      desEntetes,
      'La CSP de public/_headers et celle du <meta> de Layout.astro ont divergé. ' +
        'Les politiques CSP sont intersectives : la page ne deviendra pas moins sûre, ' +
        'elle cassera — une source autorisée d’un seul côté sera bloquée. Et ça ne se ' +
        'verra pas en local, puisque public/_headers n’est servi que par Cloudflare Pages.'
    ).toEqual(duMeta);
  });

  it('ne fait pas semblant de porter frame-ancestors dans le <meta>', () => {
    // La spec l'ignore par balise. L'y écrire donnerait deux fichiers d'apparence
    // identique dont un seul protège : le contraire du but recherché.
    expect(analyserCsp(cspDuMeta())).not.toHaveProperty('frame-ancestors');
  });

  it('porte frame-ancestors dans les en-têtes, seul endroit où il vaut quelque chose', () => {
    const csp = analyserCsp(entetesPour(REGLES, '/').get('Content-Security-Policy') ?? '');
    expect(csp['frame-ancestors']).toBe("'none'");
  });
});

describe('les fichiers qui pilotent le cache ne doivent pas être servis depuis un cache', () => {
  for (const chemin of ['/sw.js', CHEMIN_MANIFESTE]) {
    it(`${chemin} impose une revalidation`, () => {
      // Défense en profondeur assumée : le navigateur contourne déjà le cache
      // HTTP pour le script de tête du worker (updateViaCache = « imports ») et
      // le worker demande déjà le manifeste en no-store. Ces règles visent les
      // intermédiaires, que ni l'un ni l'autre ne contrôle.
      const cache = entetesPour(REGLES, chemin).get('Cache-Control');
      expect(cache, `${chemin} est servi sans Cache-Control : un intermédiaire peut en garder une copie périmée.`).toBeDefined();
      expect(cache).toMatch(/no-cache|no-store|max-age=0/);
    });
  }

  it('n’efface pas les en-têtes de sécurité du bloc large', () => {
    // Si Cloudflare remplaçait au lieu de cumuler, /sw.js perdrait sa CSP et son
    // nosniff en échange d'un Cache-Control. Ce test fige l'hypothèse dont
    // dépend la découpe du fichier.
    const entetes = entetesPour(REGLES, '/sw.js');
    expect(entetes.get('X-Content-Type-Options')).toBe('nosniff');
    expect(entetes.has('Content-Security-Policy')).toBe(true);
  });
});

describe.skipIf(!DIST_PRESENT)('livraison', () => {
  it('dist/_headers est la copie exacte de public/_headers', () => {
    /*
     * public/ est recopié verbatim par Astro. Le vérifier coûte une ligne et
     * couvre le jour où une intégration se mettrait à réécrire dist/.
     *
     * Comparaison en texte et non en Buffer : les deux sont fidèles à l'octet
     * (utf8 conserve les \r), mais un Buffer inégal se rend en liste de nombres
     * décimaux, illisible. Le diff doit nommer la ligne qui diverge.
     */
    expect(readFileSync(join(DIST, '_headers'), 'utf8')).toBe(
      readFileSync(HEADERS_SOURCE, 'utf8')
    );
  });
});

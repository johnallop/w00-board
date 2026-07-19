import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { APIContext } from 'astro';
import config from '../data/config.json';
import { GET as getFeedJson } from '../pages/feed.json';
import { GET as getFeedXml } from '../pages/feed.xml';
import { GET as getBuildJson } from '../pages/build.json';
import { GET as getSitemap } from '../pages/sitemap.xml';
import { GET as getLlms } from '../pages/llms.txt';
import { GET as getLlmsFull } from '../pages/llms-full.txt';
import { GET as getOgSite } from '../pages/og-image.png';
import { GET as getOgBoard } from '../pages/og/[id].png';
import { GET as getSw } from '../pages/sw.js';

/*
 * Le build doit produire les mêmes octets à chaque exécution.
 *
 * Ce n'est pas une préférence d'hygiène : le miroir IPFS épingle dist/ et le CID
 * est le hash de ces octets. Un seul fichier qui bouge sans raison déclarée
 * change le CID, et le nom IPNS (k51qzi5uqu…, codé en dur dans src/data/ipfs.ts,
 * jamais régénérable sans casser les liens déjà diffusés) republie vers un
 * contenu différent à chaque push. Rien ne casse visiblement — c'est justement
 * le problème.
 *
 * Trois couches, de la plus rapide à la plus lente, parce qu'aucune ne suffit :
 *
 *   1. Scan statique  — interdit les lectures d'horloge dans les sources de
 *      rendu. Instantané, mais ne voit que ce qu'un motif peut voir.
 *   2. Double appel   — chaque route appelée deux fois doit rendre les mêmes
 *      octets. Attrape ce qu'aucune regex ne trouve (ordre d'itération d'une
 *      Map, hinting de police dans satori), mais a un angle mort documenté
 *      plus bas.
 *   3. Double build   — scripts/check-reproducible.mjs, la vérité terrain.
 *      Trop lent pour vitest, branché dans deploy.yml.
 *
 * La règle exacte n'est pas « pas de Date » mais « pas de lecture d'horloge au
 * moment du rendu ». `new Date(board.date)` est un *analyseur* : déterministe,
 * et le dépôt s'en sert déjà (b/[id].astro:33, feed.xml.ts:44). `new Date()` est
 * une *horloge*. De même, `Date.now()` dans un `<script>` client s'exécute chez
 * le visiteur : le *texte* du script est constant, donc le build reste
 * reproductible — interdire `Date.now()` partout ferait rougir live.astro à
 * tort, et un test qui crie à tort est un test qu'on apprend à ignorer.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SITE = 'https://w00-board.pages.dev/';

// ── Couche 1 : scan statique ───────────────────────────────────────────────

/*
 * Motifs sans drapeau `g` : `RegExp.test()` sur une regex globale conserve
 * `lastIndex` d'un appel à l'autre et saute une ligne sur deux. Ici chaque
 * `test()` repart de zéro, et le scan ligne par ligne donne le numéro de ligne
 * gratuitement — un message d'échec sans numéro de ligne coûte plus cher à
 * exploiter qu'il ne fait gagner à écrire.
 */
const HORLOGES: Array<{ motif: RegExp; nom: string }> = [
  { motif: /new\s+Date\s*\(\s*\)/, nom: 'new Date()' },
  { motif: /\bDate\.now\s*\(/, nom: 'Date.now()' },
  { motif: /\bMath\.random\s*\(/, nom: 'Math.random()' },
  { motif: /\bcrypto\.randomUUID\s*\(/, nom: 'crypto.randomUUID()' },
  { motif: /\bperformance\.now\s*\(/, nom: 'performance.now()' },
  { motif: /\bprocess\.hrtime\b/, nom: 'process.hrtime()' },
];

/** Vide un bloc en conservant ses sauts de ligne, pour ne pas décaler la numérotation. */
function evider(bloc: string): string {
  return bloc.replace(/[^\n]/g, '');
}

/**
 * Retire ce qui ne s'exécute pas au build : commentaires, et corps des
 * `<script>` d'un fichier .astro.
 *
 * Le balisage ouvrant du script est *conservé* : `<script define:vars={{ t:
 * Date.now() }}>` évalue son attribut au build, pas dans le navigateur. Ne
 * blanchir que le corps garde ce cas sous surveillance.
 */
function deparasiter(source: string, astro: boolean): string {
  let texte = source;
  if (astro) {
    texte = texte.replace(
      /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
      (_m, ouvrant, corps, fermant) => `${ouvrant}${evider(corps)}${fermant}`
    );
    texte = texte.replace(/<!--[\s\S]*?-->/g, evider);
  }
  texte = texte.replace(/\/\*[\s\S]*?\*\//g, evider);
  // `[^:]` avant `//` : sinon le « // » de https:// est pris pour un
  // commentaire et tout ce qui suit sur la ligne devient invisible au scan.
  texte = texte.replace(/(^|[^:])\/\/[^\n]*/g, (_m, avant) => avant);
  return texte;
}

/** Lectures d'horloge d'un source, au format « ligne N : motif ». */
function lecturesDHorloge(source: string, astro = false): string[] {
  const trouvailles: string[] = [];
  deparasiter(source, astro)
    .split('\n')
    .forEach((ligne, index) => {
      for (const { motif, nom } of HORLOGES) {
        if (motif.test(ligne)) trouvailles.push(`ligne ${index + 1} : ${nom}`);
      }
    });
  return trouvailles;
}

/** Sources qui participent au rendu. src/tests et src/data en sont exclus. */
function sourcesDeRendu(dir = join(ROOT, 'src'), found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === join(ROOT, 'src', 'tests')) continue;
      sourcesDeRendu(full, found);
    } else if (['.ts', '.astro', '.js', '.mjs'].includes(extname(entry.name))) {
      found.push(full);
    }
  }
  return found;
}

const SOURCES = sourcesDeRendu();

describe('reproductibilité — scan statique des sources de rendu', () => {
  /*
   * Le scan lui-même a-t-il des dents ? Un scan qui ne trouve jamais rien et un
   * scan cassé produisent le même vert. Ces contrôles positifs le testent comme
   * n'importe quelle autre fonction, y compris sur les deux cas où il pourrait
   * mentir : le commentaire qui cite la règle, et l'URL qui contient « // ».
   */
  it('repère une horloge nue', () => {
    expect(lecturesDHorloge('const t = new Date();')).not.toHaveLength(0);
    expect(lecturesDHorloge('const t = Date.now();')).not.toHaveLength(0);
    expect(lecturesDHorloge('const r = Math.random();')).not.toHaveLength(0);
  });

  it('laisse passer un analyseur de date déclarée', () => {
    expect(lecturesDHorloge('const d = new Date(board.date);')).toHaveLength(0);
    expect(lecturesDHorloge('const d = Date.parse(board.date);')).toHaveLength(0);
  });

  it('ignore les commentaires qui citent la règle', () => {
    expect(lecturesDHorloge('// Jamais `new Date()` au build.')).toHaveLength(0);
    expect(lecturesDHorloge('/*\n * Jamais new Date() ici.\n */')).toHaveLength(0);
  });

  it("ne se laisse pas aveugler par le // d'une URL", () => {
    expect(lecturesDHorloge('const s = "https://x"; const t = new Date();')).not.toHaveLength(0);
    expect(lecturesDHorloge('const s = "https://x"; // new Date()')).toHaveLength(0);
  });

  it('ignore un <script> client mais pas son balisage ouvrant', () => {
    expect(lecturesDHorloge('<script>const t = Date.now();</script>', true)).toHaveLength(0);
    expect(
      lecturesDHorloge('<script define:vars={{ t: Date.now() }}>ok</script>', true)
    ).not.toHaveLength(0);
  });

  it('rend un numéro de ligne exact malgré les blocs évidés', () => {
    const source = '<script>\nDate.now()\n</script>\nconst t = new Date();';
    expect(lecturesDHorloge(source, true)).toEqual(['ligne 4 : new Date()']);
  });

  it('voit bien les fichiers du dépôt', () => {
    expect(SOURCES.length).toBeGreaterThan(10);
    expect(SOURCES.map((f) => relative(ROOT, f).replace(/\\/g, '/'))).toContain(
      'src/pages/sitemap.xml.ts'
    );
  });

  it('aucune lecture d’horloge dans un chemin de rendu', () => {
    const fautes: string[] = [];
    for (const fichier of SOURCES) {
      const rel = relative(ROOT, fichier).replace(/\\/g, '/');
      for (const faute of lecturesDHorloge(readFileSync(fichier, 'utf8'), rel.endsWith('.astro'))) {
        fautes.push(`${rel}, ${faute}`);
      }
    }
    expect(fautes, `lectures d'horloge au build :\n  ${fautes.join('\n  ')}`).toEqual([]);
  });
});

// ── Couche 2 : double appel ────────────────────────────────────────────────

function contexte(props: Record<string, unknown> = {}): APIContext {
  return { site: new URL(SITE), props } as unknown as APIContext;
}

/** Empreinte des octets d'une réponse — texte et PNG traités pareil. */
async function empreinteDe(reponse: Response): Promise<string> {
  return createHash('sha256').update(Buffer.from(await reponse.arrayBuffer())).digest('hex');
}

type Route = { nom: string; appel: () => Promise<Response> | Response };

const ROUTES: Route[] = [
  { nom: 'feed.json', appel: () => getFeedJson(contexte()) },
  { nom: 'feed.xml', appel: () => getFeedXml(contexte()) },
  // Seule route sans contexte : build.json ne lit ni `site` ni `props`, sa
  // signature n'en prend donc aucun. Lui en passer un compilait chez tout le
  // monde sauf le vérificateur de types — que rien n'exécutait (TS2554).
  { nom: 'build.json', appel: () => getBuildJson() },
  { nom: 'sitemap.xml', appel: () => getSitemap(contexte()) },
  { nom: 'llms.txt', appel: () => getLlms(contexte()) },
  { nom: 'llms-full.txt', appel: () => getLlmsFull(contexte()) },
  { nom: 'og-image.png', appel: () => getOgSite(contexte()) },
  // sw.js liste public/fonts/ à chaque appel plutôt qu'une fois au chargement
  // du module : une mémoïsation passerait ce double appel et divergerait quand
  // même d'un build à l'autre — l'angle mort documenté plus haut. Le tri
  // explicite du readdirSync est ce que cette ligne surveille.
  { nom: 'sw.js', appel: () => getSw() },
  ...config.billboards.map((board) => ({
    nom: `og/${board.id}.png`,
    appel: () => getOgBoard(contexte({ board })),
  })),
];

/*
 * Angle mort à énoncer plutôt qu'à masquer : la mémoïsation au niveau module.
 *
 *   const BUILD_TIME = new Date();   // évalué une fois par processus
 *
 * Les deux appels ci-dessous voient la même valeur et passent au vert, alors que
 * deux builds séparés — deux processus — diffèrent. C'est précisément le bug que
 * cette couche ne peut pas voir. Le scan statique l'attrape (l'horloge est bien
 * dans le source), et le double build de la couche 3 aussi. Aucune des trois
 * couches n'est redondante : chacune couvre le trou des autres.
 */
describe('reproductibilité — deux appels, mêmes octets', () => {
  it('la comparaison a des dents', async () => {
    let n = 0;
    const instable = () => new Response(String(n++));
    expect(await empreinteDe(instable())).not.toBe(await empreinteDe(instable()));
  });

  for (const { nom, appel } of ROUTES) {
    it(`${nom} rend les mêmes octets deux fois de suite`, async () => {
      const premiere = await appel();
      const seconde = await appel();

      /*
       * Les routes PNG attrapent leurs erreurs et renvoient un 500 JSON. Deux
       * 500 sont rigoureusement identiques : sans cette assertion, le test
       * passerait au vert le jour exact où le rendu casse.
       */
      expect(premiere.status, `${nom} n'a pas rendu 200`).toBe(200);
      expect(seconde.status, `${nom} n'a pas rendu 200 au second appel`).toBe(200);

      const a = await empreinteDe(premiere);
      const b = await empreinteDe(seconde);
      expect(b, `${nom} varie d'un appel à l'autre — le CID IPFS ne serait plus stable`).toBe(a);
    });
  }
});

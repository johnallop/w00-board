import { describe, it, expect } from 'vitest';
import {
  attendreDeploiement,
  cleIdempotence,
  filtrerCanaux,
} from '../../scripts/lib/diffusion.mjs';
import { validateConfig } from '../utils/validateConfig';
import { canonicalizeBillboard } from '../utils/posterHash';

/** Horloge et sommeil factices : le temps n'avance que quand le code dort. */
function horloge() {
  let t = 0;
  return { maintenant: () => t, sleep: async (ms: number) => void (t += ms) };
}

/** build.json tel que src/pages/build.json.ts le publie : commit + canoniques. */
const reponseBuild = (commit: string, panneaux: Array<Record<string, unknown>>) =>
  new Response(
    JSON.stringify({
      commit,
      fingerprints: {
        billboards: panneaux.map((b) => ({
          id: b.id,
          canonical: canonicalizeBillboard(b as never),
        })),
      },
    }),
    { status: 200 },
  );

const paix = {
  id: 'paix',
  message: 'LA PAIX',
  author: 'W00DDY',
  tags: ['Paix'],
  date: '2026-06-23',
};
const nouveau = { id: 'nouveau', message: 'NOUVEAU', author: 'Moi', date: '2026-11-14T12:00:00Z' };
const canoniques = [canonicalizeBillboard(nouveau)];

describe('attendreDeploiement', () => {
  it('rend la main dès que build.json sert le panneau à l’identique', async () => {
    const h = horloge();
    const deploiements = [
      reponseBuild('A', [paix]),
      reponseBuild('A', [paix]),
      reponseBuild('B', [paix, nouveau]),
    ];
    const appels: string[] = [];
    const r = await attendreDeploiement({
      siteUrl: 'https://exemple.fr',
      canoniques,
      fetch: (async (url: string) => {
        appels.push(url);
        return deploiements.shift()!;
      }) as unknown as typeof fetch,
      ...h,
    });
    expect(r).toEqual({ enLigne: true, vu: 'B', manquants: [] });
    expect(appels).toHaveLength(3);
    expect(appels[0]).toBe('https://exemple.fr/build.json');
  });

  it('accepte un déploiement PLUS RÉCENT qui a gardé le panneau intact (pushs rapprochés)', async () => {
    /*
     * La limite corrigée : la première version exigeait que build.json porte
     * exactement GITHUB_SHA. Le commit C, poussé juste après B et déployé à sa
     * place, bloquait la diffusion de B jusqu'à expiration — panneau pourtant
     * en ligne.
     */
    const autre = { id: 'autre', message: 'AUTRE', author: 'X' };
    const r = await attendreDeploiement({
      siteUrl: 'https://exemple.fr',
      canoniques,
      fetch: (async () =>
        reponseBuild('C-plus-recent', [paix, nouveau, autre])) as unknown as typeof fetch,
      ...horloge(),
    });
    expect(r.enLigne).toBe(true);
  });

  it('refuse un déploiement plus récent qui a MODIFIÉ le panneau entre-temps', async () => {
    // Annoncer l'ancienne version renverrait vers une affiche qui dit autre
    // chose ; c'est la diffusion du push suivant qui annoncera la bonne.
    const h = horloge();
    const r = await attendreDeploiement({
      siteUrl: 'https://exemple.fr',
      canoniques,
      fetch: (async () =>
        reponseBuild('C', [
          paix,
          { ...nouveau, message: 'NOUVEAU (corrigé)' },
        ])) as unknown as typeof fetch,
      delaiMax: 60_000,
      intervalle: 15_000,
      ...h,
    });
    expect(r).toEqual({ enLigne: false, vu: 'C', manquants: canoniques });
    expect(h.maintenant()).toBeLessThanOrEqual(60_000);
  });

  it('abandonne au délai au lieu de diffuser un lien mort', async () => {
    const h = horloge();
    const r = await attendreDeploiement({
      siteUrl: 'https://exemple.fr',
      canoniques,
      fetch: (async () => reponseBuild('ancien', [paix])) as unknown as typeof fetch,
      delaiMax: 60_000,
      intervalle: 15_000,
      ...h,
    });
    expect(r).toEqual({ enLigne: false, vu: 'ancien', manquants: canoniques });
    expect(h.maintenant()).toBeLessThanOrEqual(60_000);
  });

  it('ne se laisse pas débloquer par un build.json sans empreintes', async () => {
    const r = await attendreDeploiement({
      siteUrl: 'https://exemple.fr',
      canoniques,
      fetch: (async () =>
        new Response(JSON.stringify({ commit: 'x' }), { status: 200 })) as unknown as typeof fetch,
      delaiMax: 30_000,
      intervalle: 15_000,
      ...horloge(),
    });
    expect(r.enLigne).toBe(false);
  });

  it('survit à un site injoignable ou en erreur, puis attend', async () => {
    const h = horloge();
    let n = 0;
    const r = await attendreDeploiement({
      siteUrl: 'https://exemple.fr',
      canoniques,
      fetch: (async () => {
        n += 1;
        if (n === 1) throw new Error('ECONNRESET');
        if (n === 2) return new Response('oups', { status: 503 });
        return reponseBuild('c', [nouveau]);
      }) as unknown as typeof fetch,
      ...h,
    });
    expect(r.enLigne).toBe(true);
    expect(n).toBe(3);
  });

  it('reconnaît le build.json réellement produit par le site', async () => {
    // Garde contre une divergence de format entre la route et la porte.
    const { GET } = await import('../pages/build.json.ts');
    const reel = await (await GET()).text();
    const config = (await import('../data/config.json')).default;
    const r = await attendreDeploiement({
      siteUrl: 'https://exemple.fr',
      canoniques: config.billboards.map((b) => canonicalizeBillboard(b)),
      fetch: (async () => new Response(reel, { status: 200 })) as unknown as typeof fetch,
      ...horloge(),
    });
    expect(r.enLigne).toBe(true);
  });
});

describe('cleIdempotence', () => {
  it('est identique pour deux tentatives du même run', () => {
    expect(cleIdempotence({ id: 'paix' }, '123', false)).toBe(
      cleIdempotence({ id: 'paix' }, '123', false),
    );
  });

  it('change avec le run, le panneau et le mode', () => {
    const base = cleIdempotence({ id: 'paix' }, '123', false);
    expect(cleIdempotence({ id: 'paix' }, '124', false)).not.toBe(base);
    expect(cleIdempotence({ id: 'autre' }, '123', false)).not.toBe(base);
    expect(cleIdempotence({ id: 'paix' }, '123', true)).not.toBe(base);
  });
});

describe('filtrerCanaux', () => {
  const tous = ['mastodon', 'bluesky', 'nostr'];

  it('garde tous les canaux sans filtre', () => {
    expect(filtrerCanaux(tous, undefined)).toEqual(tous);
    expect(filtrerCanaux(tous, '  ')).toEqual(tous);
  });

  it('ne garde que les canaux demandés, casse et espaces ignorés', () => {
    expect(filtrerCanaux(tous, ' Nostr , mastodon')).toEqual(['mastodon', 'nostr']);
  });

  it('refuse un canal inconnu plutôt que de ne rien publier en silence', () => {
    expect(() => filtrerCanaux(tous, 'nostr,mastodom')).toThrow(/mastodom/);
  });
});

describe('theme.backgroundColor — fond sombre exigé', () => {
  const config = (backgroundColor: string, textColor: string, accentColor: string) => ({
    billboards: [{ id: 'a', message: 'b', author: 'c' }],
    theme: { backgroundColor, textColor, accentColor, fontSize: '2.5rem', fontFamily: 'Inter' },
    layout: { horizontalAlignment: 'center', verticalAlignment: 'center' },
  });

  it('accepte le thème actuel', () => {
    expect(() => validateConfig(config('#0f172a', '#f8fafc', '#38bdf8'))).not.toThrow();
  });

  it('refuse un thème clair, dont les textes secondaires seraient blancs sur blanc', () => {
    // Texte et accent sombres : contraste principal valide, seul le fond pèche.
    expect(() => validateConfig(config('#ffffff', '#000000', '#1d4ed8'))).toThrow(
      /trop clair pour les textes secondaires/,
    );
  });
});

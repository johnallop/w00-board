import { describe, it, expect } from 'vitest';
import { validateConfig } from '../utils/validateConfig';
import { RESEAUX_SOCIAUX, MAX_PROFILS_SOCIAUX, libelleReseau } from '../utils/social';

const base = {
  billboards: [{ id: 'test-1', message: 'Bonjour', author: 'Moi' }],
  theme: {
    backgroundColor: '#0f172a',
    textColor: '#f8fafc',
    accentColor: '#38bdf8',
    fontSize: '2.5rem',
    fontFamily: 'Inter',
  },
  layout: { horizontalAlignment: 'center', verticalAlignment: 'center' },
};

const avec = (social: unknown) => ({ ...base, social });

describe('config.social', () => {
  it('reste optionnel : une config sans comptes est valide', () => {
    expect(() => validateConfig(base)).not.toThrow();
  });

  it('accepte des profils https, avec ou sans libellé', () => {
    expect(() =>
      validateConfig(
        avec([
          {
            network: 'mastodon',
            url: 'https://mastodon.social/@w00',
            label: '@w00@mastodon.social',
          },
          { network: 'bluesky', url: 'https://bsky.app/profile/w00.bsky.social' },
          { network: 'nostr', url: 'https://njump.me/npub1exemple' },
        ]),
      ),
    ).not.toThrow();
  });

  it.each([
    ['un objet au lieu d’un tableau', { network: 'x', url: 'https://x.com/a' }, /tableau/],
    [
      'un réseau inconnu',
      [{ network: 'mastodom', url: 'https://a.b' }],
      /"social\[0\]\.network".*mastodon/,
    ],
    ['javascript:', [{ network: 'website', url: 'javascript:alert(1)' }], /https/],
    ['data:', [{ network: 'website', url: 'data:text/html,x' }], /https/],
    ['http en clair', [{ network: 'website', url: 'http://exemple.fr' }], /https/],
    ['une URL relative', [{ network: 'website', url: '/moi' }], /URL absolue/],
    ['un libellé vide', [{ network: 'github', url: 'https://github.com/a', label: ' ' }], /label/],
    [
      'un libellé trop long',
      [{ network: 'github', url: 'https://github.com/a', label: 'x'.repeat(41) }],
      /label/,
    ],
    [
      'une URL en double',
      [
        { network: 'github', url: 'https://github.com/a' },
        { network: 'website', url: 'https://github.com/a' },
      ],
      /deux fois/,
    ],
  ])('refuse %s', (_cas, social, motif) => {
    expect(() => validateConfig(avec(social))).toThrow(motif);
  });

  it(`refuse plus de ${MAX_PROFILS_SOCIAUX} profils`, () => {
    const trop = Array.from({ length: MAX_PROFILS_SOCIAUX + 1 }, (_, i) => ({
      network: 'website',
      url: `https://exemple.fr/${i}`,
    }));
    expect(() => validateConfig(avec(trop))).toThrow(/au plus/);
  });

  it('a un libellé lisible pour chaque réseau de la liste', () => {
    for (const r of RESEAUX_SOCIAUX) expect(libelleReseau(r).trim()).not.toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import {
  ID_URL_SAFE,
  validerPanneauDiffusable,
  validerSiteUrl,
  verdictDiffusion,
} from '../../scripts/lib/diffusion.mjs';
import { validateConfig } from '../utils/validateConfig';

/*
 * `broadcast.yml` ne build pas : il fait `npm ci` puis lance directement
 * `scripts/broadcast.mjs`. `validateConfig` — qui ne s'exécute qu'au build —
 * n'avait donc jamais son mot à dire sur ce qui partait vers Mastodon,
 * Bluesky, Nostr, Telegram et Discord. Ces contrôles ferment cette voie.
 */

describe('validerPanneauDiffusable', () => {
  const panneau = { id: 'jesus-aime', message: 'Un message', author: 'Un auteur', tags: ['Foi'] };

  it('accepte un panneau diffusable', () => {
    expect(() => validerPanneauDiffusable(panneau)).not.toThrow();
  });

  it('accepte un panneau sans tags (champ optionnel)', () => {
    expect(() => validerPanneauDiffusable({ id: 'x', message: 'M', author: 'A' })).not.toThrow();
  });

  it("refuse un id qui s'échapperait du chemin de l'URL diffusée", () => {
    // L'id devient un segment de `${siteUrl}/b/${board.id}/`, publié tel quel.
    for (const id of ['../../evil', 'a/b', 'a b', 'a?x=1', 'a#frag', '']) {
      expect(() => validerPanneauDiffusable({ ...panneau, id })).toThrow('"id"');
    }
  });

  it('refuse un message ou un auteur absent plutôt que de publier « undefined »', () => {
    expect(() => validerPanneauDiffusable({ ...panneau, message: undefined })).toThrow('"message"');
    expect(() => validerPanneauDiffusable({ ...panneau, author: '   ' })).toThrow('"author"');
  });

  it('refuse des tags non textuels — ils sont transformés en hashtags par .replace()', () => {
    // `tags.map((t) => '#' + t.replace(...))` lève un TypeError sur un nombre.
    expect(() => validerPanneauDiffusable({ ...panneau, tags: [42] })).toThrow('"tags"');
    expect(() => validerPanneauDiffusable({ ...panneau, tags: 'Foi' })).toThrow('"tags"');
  });

  it('refuse une valeur qui n’est pas un objet', () => {
    for (const valeur of [null, undefined, 'panneau', []]) {
      expect(() => validerPanneauDiffusable(valeur)).toThrow();
    }
  });

  it('nomme le panneau fautif dans le message', () => {
    expect(() => validerPanneauDiffusable({ ...panneau, id: 'a b' }, 'panneau à diffuser [2]')).toThrow(
      'panneau à diffuser [2]'
    );
  });
});

/*
 * Le vrai risque de ce module n'est pas d'être faux aujourd'hui : c'est de
 * diverger de `validateConfig` demain. Ce contrôle compare les deux portes sur
 * le même corpus d'identifiants et échoue si l'une accepte ce que l'autre
 * refuse — au lieu de laisser la divergence s'installer en silence.
 */
describe('accord avec validateConfig sur les identifiants', () => {
  const configValide = {
    billboards: [{ id: 'test-1', message: 'M', author: 'A' }],
    theme: {
      backgroundColor: '#0f172a',
      textColor: '#f8fafc',
      accentColor: '#38bdf8',
      fontSize: '2.5rem',
      fontFamily: 'Inter',
    },
    layout: { horizontalAlignment: 'center', verticalAlignment: 'center' },
  };

  const accepte = (fn: () => void) => {
    try {
      fn();
      return true;
    } catch {
      return false;
    }
  };

  it.each([
    'jesus-aime',
    'paix',
    'un_id_2026',
    'MAJUSCULES',
    '../../root',
    'a b',
    'a/b',
    'a?x=1',
    'a.b',
    'é',
    '',
    'a:b',
    'a;b',
  ])('les deux validateurs sont d’accord sur %o', (id) => {
    const cotéBuild = accepte(() =>
      validateConfig({ ...configValide, billboards: [{ id, message: 'M', author: 'A' }] })
    );
    const cotéDiffusion = accepte(() => validerPanneauDiffusable({ id, message: 'M', author: 'A' }));
    expect(cotéDiffusion).toBe(cotéBuild);
  });

  it('expose la même expression que celle documentée', () => {
    expect(ID_URL_SAFE.source).toBe('^[a-z0-9-_]+$');
    expect(ID_URL_SAFE.flags).toBe('i');
  });
});

describe('validerSiteUrl', () => {
  it('normalise en supprimant la barre oblique finale', () => {
    expect(validerSiteUrl('https://w00-board.pages.dev/')).toBe('https://w00-board.pages.dev');
    expect(validerSiteUrl('https://w00-board.pages.dev')).toBe('https://w00-board.pages.dev');
  });

  it('conserve un chemin de base', () => {
    expect(validerSiteUrl('https://exemple.test/mur/')).toBe('https://exemple.test/mur');
  });

  it('refuse une URL relative — elle produirait un lien mort dans chaque message', () => {
    expect(() => validerSiteUrl('w00-board.pages.dev')).toThrow('URL absolue');
  });

  it('refuse un protocole non diffusable', () => {
    expect(() => validerSiteUrl('javascript:alert(1)')).toThrow('protocole');
    expect(() => validerSiteUrl('file:///etc/passwd')).toThrow('protocole');
  });

  it('refuse une valeur vide ou non textuelle', () => {
    for (const valeur of ['', '   ', null, undefined, 42]) {
      expect(() => validerSiteUrl(valeur)).toThrow('SITE_URL');
    }
  });
});

/*
 * Le défaut d'origine : chaque erreur de canal était attrapée, journalisée,
 * puis oubliée. `main()` se résolvait, le processus sortait 0, le workflow
 * s'affichait vert — y compris quand les cinq canaux avaient échoué.
 */
describe('verdictDiffusion', () => {
  it('réussit quand tous les canaux ont publié', () => {
    const v = verdictDiffusion([
      { canal: 'mastodon', etat: 'publie' },
      { canal: 'bluesky', etat: 'publie' },
    ]);
    expect(v.code).toBe(0);
  });

  it('ÉCHOUE quand tous les canaux échouent — c’était le cas vert d’avant', () => {
    const v = verdictDiffusion([
      { canal: 'mastodon', etat: 'echec' },
      { canal: 'bluesky', etat: 'echec' },
      { canal: 'nostr', etat: 'echec' },
      { canal: 'telegram', etat: 'echec' },
      { canal: 'discord', etat: 'echec' },
    ]);
    expect(v.code).toBe(1);
    expect(v.resume).toContain('mastodon');
  });

  it('échoue dès qu’un seul canal configuré échoue', () => {
    const v = verdictDiffusion([
      { canal: 'mastodon', etat: 'publie' },
      { canal: 'bluesky', etat: 'echec' },
    ]);
    expect(v.code).toBe(1);
    expect(v.resume).toContain('bluesky');
  });

  it('ÉCHOUE quand aucun canal n’est configuré — personne n’a reçu le message', () => {
    // Un heartbeat hebdomadaire sans secrets sortait 0 : indistinguable d'un
    // heartbeat réussi.
    const v = verdictDiffusion([
      { canal: 'mastodon', etat: 'absent' },
      { canal: 'bluesky', etat: 'absent' },
    ]);
    expect(v.code).toBe(1);
    expect(v.resume).toContain("aucun canal n'a reçu le message");
  });

  it('tolère une configuration partielle si au moins un canal a publié', () => {
    // Ne configurer que Mastodon est un choix légitime, pas une panne.
    const v = verdictDiffusion([
      { canal: 'mastodon', etat: 'publie' },
      { canal: 'bluesky', etat: 'absent' },
      { canal: 'nostr', etat: 'absent' },
    ]);
    expect(v.code).toBe(0);
    expect(v.resume).toContain('non configuré');
  });

  it('traite un dry-run sans secrets comme un succès', () => {
    const v = verdictDiffusion([
      { canal: 'mastodon', etat: 'simule' },
      { canal: 'bluesky', etat: 'simule' },
    ]);
    expect(v.code).toBe(0);
  });

  it('échoue sur une liste vide plutôt que de la déclarer réussie', () => {
    expect(verdictDiffusion([]).code).toBe(1);
  });

  it('nomme chaque canal en échec dans le résumé', () => {
    const v = verdictDiffusion([
      { canal: 'mastodon', etat: 'publie' },
      { canal: 'telegram', etat: 'echec' },
      { canal: 'discord', etat: 'absent' },
    ]);
    expect(v.resume).toContain('mastodon');
    expect(v.resume).toContain('telegram');
    expect(v.resume).toContain('discord');
  });
});

import { describe, it, expect } from 'vitest';
import { RichText } from '@atproto/api';
import * as matrix from '../../scripts/post-matrix.mjs';
import * as misskey from '../../scripts/post-misskey.mjs';
import * as ntfy from '../../scripts/post-ntfy.mjs';
import { composerTexte, LIMITE_GRAPHEMES } from '../../scripts/post-bluesky.mjs';

/*
 * Les clients de diffusion sont testés sans réseau : chacun expose la requête
 * qu'il enverrait (`construireRequete`), seule partie qui porte une décision.
 * L'appel `fetch` lui-même n'est qu'un transport.
 */

const params = {
  message: 'LA PAIX SOIT AVEC VOUS',
  author: 'W00DDY',
  hashtags: '#Paix #Foi',
  url: 'https://board.wooddyviat.com/b/paix/',
};

describe('Matrix', () => {
  const env = {
    MATRIX_HOMESERVER: 'https://matrix.example.org/',
    MATRIX_ACCESS_TOKEN: 'syt_secret',
    MATRIX_ROOM_ID: '!salon:example.org',
  };

  it('vise l’endpoint send de la spec, avec salon et transaction encodés', () => {
    const { url, init } = matrix.construireRequete(params, env, 'w00/1');
    expect(url).toBe(
      'https://matrix.example.org/_matrix/client/v3/rooms/!salon%3Aexample.org/send/m.room.message/w00%2F1',
    );
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe('Bearer syt_secret');
  });

  it('envoie du texte brut m.text, sans HTML', () => {
    const corps = JSON.parse(matrix.construireRequete(params, env, 't').init.body);
    expect(corps.msgtype).toBe('m.text');
    expect(corps.body).toContain(params.message);
    expect(corps.body).toContain(params.url);
    expect(corps).not.toHaveProperty('formatted_body');
  });

  it('nomme les secrets manquants', () => {
    expect(() => matrix.construireRequete(params, {}, 't')).toThrow(/MATRIX_ROOM_ID/);
  });
});

describe('Misskey', () => {
  const env = { MISSKEY_INSTANCE: 'https://misskey.example/', MISSKEY_TOKEN: 'jeton' };

  it('publie une note par notes/create, jeton en Bearer et jamais dans le corps', () => {
    const { url, init } = misskey.construireRequete(params, env);
    expect(url).toBe('https://misskey.example/api/notes/create');
    expect(init.headers.Authorization).toBe('Bearer jeton');
    const corps = JSON.parse(init.body);
    expect(corps.text).toContain(params.message);
    expect(corps).not.toHaveProperty('i');
  });

  it('nomme les secrets manquants', () => {
    expect(() => misskey.construireRequete(params, { MISSKEY_INSTANCE: 'https://a' })).toThrow(
      /MISSKEY_TOKEN/,
    );
  });
});

describe('ntfy', () => {
  it('publie sur ntfy.sh par défaut, sujet encodé, sans jeton si absent', () => {
    const { url, init } = ntfy.construireRequete(params, { NTFY_TOPIC: 'w00 board' });
    expect(url).toBe('https://ntfy.sh/w00%20board');
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(init.headers.Click).toBe(params.url);
    expect(init.body).toContain(params.message);
  });

  it('utilise le serveur et le jeton fournis', () => {
    const { url, init } = ntfy.construireRequete(params, {
      NTFY_TOPIC: 'w00',
      NTFY_SERVER: 'https://ntfy.example/',
      NTFY_TOKEN: 'tk_abc',
    });
    expect(url).toBe('https://ntfy.example/w00');
    expect(init.headers.Authorization).toBe('Bearer tk_abc');
  });

  it('encode le titre non ASCII en RFC 2047, que fetch accepte en en-tête', () => {
    const titre = ntfy.construireRequete({ ...params, author: 'Élodie 🔥' }, { NTFY_TOPIC: 't' })
      .init.headers.Title;
    expect(titre).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    expect(Buffer.from(titre.slice(10, -2), 'base64').toString('utf8')).toBe(
      'W00-Board — Élodie 🔥',
    );
    expect(() => new Headers({ Title: titre })).not.toThrow();
    expect(ntfy.enteteRfc2047('ASCII seul')).toBe('ASCII seul');
  });

  it('nomme le secret manquant', () => {
    expect(() => ntfy.construireRequete(params, {})).toThrow(/NTFY_TOPIC/);
  });
});

describe('Bluesky — texte sous la limite de graphèmes', () => {
  const graphemes = (t: string) => new RichText({ text: t }).graphemeLength;

  it('garde un message court intact, hashtags compris', () => {
    const t = composerTexte(params);
    expect(t).toContain(params.message);
    expect(t).toContain(params.hashtags);
  });

  it.each([
    ['ASCII', 'A'.repeat(400)],
    ['accentué', 'é'.repeat(400)],
    ['emoji', '🔥'.repeat(400)],
    ['drapeaux (graphèmes multi-points)', '🇫🇷'.repeat(400)],
  ])('tronque un message long %s à %i graphèmes au plus', (_cas, message) => {
    /*
     * La version précédente comptait en unités UTF-16 et oubliait préfixe et
     * signature : 309 graphèmes pour un message ASCII de 400 caractères,
     * rejeté par Bluesky.
     */
    const t = composerTexte({ ...params, message });
    expect(graphemes(t)).toBeLessThanOrEqual(LIMITE_GRAPHEMES);
    expect(t).toContain('…');
    expect(t).toContain(params.url);
    expect(t).toContain(params.author);
  });

  it('ne laisse jamais un drapeau coupé en deux', () => {
    const t = composerTexte({ ...params, message: '🇫🇷'.repeat(400) });
    expect(t).not.toMatch(/\u{1F1EB}(?!\u{1F1F7})/u);
  });
});

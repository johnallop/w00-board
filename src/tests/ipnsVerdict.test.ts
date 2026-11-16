import { describe, it, expect } from 'vitest';
import {
  racineServie,
  validiteDuRecord,
  versSequence,
  verdictDeRelecture,
  verdictDeSurveillance,
} from '../../scripts/lib/ipns-verdict.mjs';

// La publication elle-même (PUT sur l'API Filebase) n'est pas testable ici :
// elle écrirait sur le vrai nom public du site. C'est pourquoi la logique de
// verdict vit dans un module pur — c'est la partie qu'on peut mettre sous test.

const NOM = 'k51qzi5uqu5dj2p76paxdtfrdr86kc6txooxipz0l3w4osuyn1rqlu919xrlyi';
const CID_A = 'bafybeih72jcva24dzyr3abeonigo523ssqyr54hmt3rjdkfy2zxjegi5u4';
const CID_B = 'bafybeidhfevo7d3mzvvwvbnwmqtgm5xr7dkuk5hbwtjzwqjqhqvbxq5ova';

/** Entrée de l'API au format mesuré le 2026-11-15 (GET /v1/names). */
const entree = (cid: string, sequence: unknown, network_key = NOM) => ({
  enabled: true,
  label: 'w00-board',
  network_key,
  cid,
  sequence,
  published_at: '2026-11-15T00:46:10.834-05:00',
});

describe('versSequence', () => {
  it.each([
    [0n, 0n],
    [42n, 42n],
    // l'API Filebase renvoie un Number dans son JSON
    [0, 0n],
    [7, 7n],
    ['12', 12n],
  ])('%s → %s', (valeur, attendu) => {
    expect(versSequence(valeur)).toBe(attendu);
  });

  it.each([[-1], [1.5], ['abc'], [''], [null], [undefined], [{}], [NaN]])('rejette %s', (valeur) => {
    expect(versSequence(valeur)).toBeNull();
  });
});

describe('racineServie', () => {
  it('prend la racine du site, première de X-Ipfs-Roots (valeur mesurée)', () => {
    const entete =
      'bafybeicy74buzwzjtnvdtysz2izi7mwsntzkkz5sv6slvrvyjfqmgba7li,bafkreif7ltyvov4y5smi7waqnxfmttzr76elg3iq7dr44leuxbwk77uc5e';
    expect(racineServie(entete)).toBe('bafybeicy74buzwzjtnvdtysz2izi7mwsntzkkz5sv6slvrvyjfqmgba7li');
  });

  it.each([[null], [undefined], [''], ['pas-un-cid'], [' , ']])('rend null sur %s', (entete) => {
    expect(racineServie(entete)).toBeNull();
  });
});

describe('verdictDeRelecture', () => {
  it('accepte une publication relue par l’API ET servie par la passerelle', () => {
    const v = verdictDeRelecture({
      cid: CID_A,
      nom: NOM,
      avant: entree(CID_B, 3),
      apres: entree(CID_A, 4),
      racine: CID_A,
    });
    expect(v.ok).toBe(true);
    expect(v.code).toBe('ok');
  });

  it('compare les séquences sans se faire piéger par BigInt vs Number', () => {
    const v = verdictDeRelecture({ cid: CID_A, nom: NOM, avant: entree(CID_A, 3n), apres: entree(CID_A, 4), racine: CID_A });
    expect(v.ok).toBe(true);
  });

  it('signale un nom disparu de l’API', () => {
    const v = verdictDeRelecture({ cid: CID_A, nom: NOM, avant: entree(CID_B, 1), apres: null, racine: null });
    expect(v.code).toBe('absent');
  });

  it('refuse un label qui désigne un autre nom public que celui du site', () => {
    const v = verdictDeRelecture({
      cid: CID_A,
      nom: NOM,
      avant: entree(CID_B, 1),
      apres: entree(CID_A, 2, 'k51autrenom'),
      racine: CID_A,
    });
    expect(v.code).toBe('nom');
  });

  it('signale un nom qui désigne un autre contenu', () => {
    const v = verdictDeRelecture({ cid: CID_A, nom: NOM, avant: entree(CID_B, 4), apres: entree(CID_B, 5), racine: CID_B });
    expect(v.code).toBe('valeur');
    expect(v.details.join(' ')).toContain(CID_B);
  });

  /*
   * LE CAS DÉCISIF — celui qui justifie le contrôle de séquence.
   *
   * Mesuré le 2026-11-15 : un PUT Filebase au MÊME CID répond 200 et ne
   * republie rien (séquence 1 → 1). L'API comme la passerelle montrent ce CID
   * dans les deux cas : sans la séquence, la relecture serait verte.
   */
  it('voit une republication qui n’a pas abouti, à CID identique (PUT ignoré)', () => {
    const v = verdictDeRelecture({ cid: CID_A, nom: NOM, avant: entree(CID_A, 8), apres: entree(CID_A, 8), racine: CID_A });
    expect(v.ok).toBe(false);
    expect(v.code).toBe('sequence');
  });

  /*
   * LA LEÇON DE W3NAME. Son API relisait un enregistrement « conforme » que le
   * réseau ne voyait pas. Une API à jour ne suffit pas : la passerelle doit
   * servir ce CID sous le nom.
   */
  it('refuse une API à jour quand la passerelle ne résout pas le nom', () => {
    const v = verdictDeRelecture({ cid: CID_A, nom: NOM, avant: entree(CID_B, 1), apres: entree(CID_A, 2), racine: null });
    expect(v.code).toBe('passerelle');
  });

  it('refuse une passerelle qui sert encore l’ancien contenu', () => {
    const v = verdictDeRelecture({ cid: CID_A, nom: NOM, avant: entree(CID_B, 1), apres: entree(CID_A, 2), racine: CID_B });
    expect(v.code).toBe('passerelle');
  });

  // Même principe que `--expect ""` dans check-cid.mjs : une attente vide doit
  // faire échouer le contrôle, jamais le rendre permissif.
  it.each([
    ['cid vide', { cid: '', nom: NOM }],
    ['cid malformé', { cid: 'Qm123', nom: NOM }],
    ['nom vide', { cid: CID_A, nom: '' }],
  ])('refuse de valider une attente inexploitable (%s)', (_, attente) => {
    const v = verdictDeRelecture({ ...attente, avant: null, apres: entree(CID_A, 1), racine: CID_A });
    expect(v.ok).toBe(false);
    expect(v.code).toBe('invalide');
  });
});

/**
 * Enregistrement réel du nom du site, lu le 2026-11-16 sur
 * https://delegated-ipfs.dev/routing/v1/ipns/<NOM>
 * (Accept: application/vnd.ipfs.ipns-record) : 221 octets, séquence 1.
 * Public par nature — signature et données, aucune clé privée.
 */
const RECORD_MESURE = Buffer.from(
  'QkDXfL0LCNPdOpaUQ9zbJuB5tJopBeATLqbek6p8c0w6GvXfVO82nR8hJQCOpODT1na8+W7SWHqj8a62VRhd98QGSpgBpWNUVEwbAAAARdlkuABl' +
    'VmFsdWVYQS9pcGZzL2JhZnliZWljeTc0YnV6d3pqdG52ZHR5c3oyaXppN213c250emtrejVzdjZzbHZydnlqZnFtZ2JhN2xpaFNlcXVlbmNlAWhW' +
    'YWxpZGl0eVgeMjAyNi0xMS0xN1QwNTo0NjoxMC43MjkwMDAwMDBabFZhbGlkaXR5VHlwZQA=',
  'base64'
);
const ECHEANCE_MESUREE = '2026-11-17T05:46:10.729Z';

describe('validiteDuRecord', () => {
  it('lit l’échéance d’un enregistrement réel (nanosecondes tronquées)', () => {
    expect(validiteDuRecord(RECORD_MESURE)?.toISOString()).toBe(ECHEANCE_MESUREE);
  });

  it('lit une longueur portée par l’en-tête CBOR, sans fraction de seconde', () => {
    // 0x68 'Validity', puis chaîne d'octets de 20 (0x40 + 20 = 0x54)
    const octets = Buffer.concat([Buffer.from([0x68]), Buffer.from('Validity'), Buffer.from([0x54]), Buffer.from('2026-11-17T05:46:10Z')]);
    expect(validiteDuRecord(octets)?.toISOString()).toBe('2026-11-17T05:46:10.000Z');
  });

  it('ignore une date qui n’est pas en UTC RFC 3339', () => {
    const octets = Buffer.concat([Buffer.from([0x68]), Buffer.from('Validity'), Buffer.from([0x53]), Buffer.from('17/11/2026 05:46:10')]);
    expect(validiteDuRecord(octets)).toBeNull();
  });

  it.each([
    // réponse réelle de delegated-ipfs.dev pour un nom inconnu (HTTP 200)
    ['nom inconnu du routage', Buffer.from('delegate error: routing: not found\n')],
    ['enregistrement tronqué', RECORD_MESURE.subarray(0, 180)],
    ['vide', new Uint8Array()],
    ['absent', null],
  ])('rend null : %s', (_, octets) => {
    expect(validiteDuRecord(octets)).toBeNull();
  });
});

describe('verdictDeSurveillance', () => {
  const CID_SITE = 'bafybeicy74buzwzjtnvdtysz2izi7mwsntzkkz5sv6slvrvyjfqmgba7li';
  const MARGE = 24 * 3_600_000;
  const echeance = new Date(ECHEANCE_MESUREE);
  const base = {
    cid: CID_SITE,
    nom: NOM,
    entree: entree(CID_SITE, 1),
    racine: CID_SITE,
    validite: echeance,
    margeMs: MARGE,
  };

  it('accepte un nom conforme qui reste valide plus de 24 h', () => {
    const v = verdictDeSurveillance({ ...base, maintenant: new Date('2026-11-16T01:22:50Z') });
    expect(v.ok).toBe(true);
    expect(v.resume).toContain('28.4 h');
  });

  /*
   * LE CAS QUI MOTIVE LA SURVEILLANCE : l'API, la passerelle et le CID sont
   * conformes, la séquence n'a pas bougé depuis la création — tout est vert,
   * sauf que l'enregistrement tombe dans moins de 24 h.
   */
  it('alerte avant l’expiration, quand tout le reste est conforme', () => {
    const v = verdictDeSurveillance({ ...base, maintenant: new Date('2026-11-16T09:00:00Z') });
    expect(v.ok).toBe(false);
    expect(v.code).toBe('expiration');
    expect(v.resume).toContain('20.8 h');
  });

  it('dit qu’un enregistrement a expiré', () => {
    const v = verdictDeSurveillance({ ...base, maintenant: new Date('2026-11-18T00:00:00Z') });
    expect(v.code).toBe('expiration');
    expect(v.resume).toContain('a expiré');
  });

  it('refuse un nom que le routage IPFS ne distribue pas (leçon w3name)', () => {
    const v = verdictDeSurveillance({ ...base, validite: null, maintenant: new Date('2026-11-16T01:00:00Z') });
    expect(v.code).toBe('routage');
  });

  it('signale un nom qui ne désigne plus le dernier CID épinglé', () => {
    const v = verdictDeSurveillance({
      ...base,
      entree: entree(CID_A, 3),
      racine: CID_A,
      maintenant: new Date('2026-11-16T01:00:00Z'),
    });
    expect(v.code).toBe('valeur');
  });

  it('reprend le contrôle passerelle de la relecture', () => {
    const v = verdictDeSurveillance({ ...base, racine: null, maintenant: new Date('2026-11-16T01:00:00Z') });
    expect(v.code).toBe('passerelle');
  });
});

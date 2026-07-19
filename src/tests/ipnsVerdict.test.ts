import { describe, it, expect } from 'vitest';
import { versSequence, verdictDeRelecture } from '../../scripts/lib/ipns-verdict.mjs';

// `Name.publish` n'est pas testable ici : publier depuis un poste de
// développement écrirait sur le vrai nom public du site (src/data/ipfs.ts
// interdit explicitement de le faire bouger). C'est précisément pourquoi la
// logique de verdict vit dans un module pur — c'est la seule partie qu'on
// puisse mettre sous test.

describe('versSequence', () => {
  it.each([
    [0n, 0n],
    [42n, 42n],
    // w3name renvoie des BigInt, mais un JSON relu ou un test donne un Number
    [0, 0n],
    [7, 7n],
    ['12', 12n],
  ])('%s → %s', (entree, attendu) => {
    expect(versSequence(entree)).toBe(attendu);
  });

  it.each([[-1], [1.5], ['abc'], [''], [null], [undefined], [{}], [NaN]])(
    'rejette %s',
    (entree) => {
      expect(versSequence(entree)).toBeNull();
    }
  );
});

describe('verdictDeRelecture', () => {
  const CID_A = '/ipfs/bafybeih72jcva24dzyr3abeonigo523ssqyr54hmt3rjdkfy2zxjegi5u4';
  const CID_B = '/ipfs/bafybeidhfevo7d3mzvvwvbnwmqtgm5xr7dkuk5hbwtjzwqjqhqvbxq5ova';

  it('accepte une relecture conforme', () => {
    const v = verdictDeRelecture({ value: CID_A, sequence: 3n }, { value: CID_A, sequence: 3n });
    expect(v.ok).toBe(true);
    expect(v.code).toBe('ok');
  });

  // Régression sur le piège mesuré : `3n === 3` vaut false. Une comparaison
  // stricte contre un Number rendrait ce contrôle rouge en permanence.
  it('compare les séquences sans se faire piéger par BigInt vs Number', () => {
    expect(verdictDeRelecture({ value: CID_A, sequence: 3n }, { value: CID_A, sequence: 3 }).ok).toBe(true);
    expect(verdictDeRelecture({ value: CID_A, sequence: 3 }, { value: CID_A, sequence: 3n }).ok).toBe(true);
  });

  it('signale un nom qui ne résout pas après publication', () => {
    const v = verdictDeRelecture({ value: CID_A, sequence: 0n }, null);
    expect(v.ok).toBe(false);
    expect(v.code).toBe('absent');
  });

  it('signale un nom qui désigne un autre contenu', () => {
    const v = verdictDeRelecture({ value: CID_A, sequence: 4n }, { value: CID_B, sequence: 4n });
    expect(v.ok).toBe(false);
    expect(v.code).toBe('valeur');
    expect(v.details.join(' ')).toContain(CID_B);
  });

  /*
   * LE CAS DÉCISIF — celui qui justifie l'existence du second contrôle.
   *
   * Le heartbeat republie chaque lundi le MÊME CID. Si `Name.publish` échoue,
   * l'enregistrement précédent reste en place : sa valeur est identique à celle
   * qu'on vient de signer. Une vérification qui ne regarderait que la valeur
   * serait donc verte, semaine après semaine, jusqu'à l'expiration du nom.
   *
   * Ici : valeur identique, séquence en retard → doit être ROUGE.
   */
  it('voit une republication qui n’a pas abouti, à valeur identique (cas heartbeat)', () => {
    const signe = { value: CID_A, sequence: 9n }; // increment de 8 → 9
    const relu = { value: CID_A, sequence: 8n }; // le service a gardé l'ancien

    expect(relu.value).toBe(signe.value); // le contrôle « valeur » serait VERT

    const v = verdictDeRelecture(signe, relu);
    expect(v.ok).toBe(false);
    expect(v.code).toBe('sequence');
    expect(v.details.join(' ')).toContain('n’a pas abouti');
  });

  it('distingue une publication concurrente d’une publication perdue', () => {
    const v = verdictDeRelecture({ value: CID_A, sequence: 9n }, { value: CID_A, sequence: 10n });
    expect(v.ok).toBe(false);
    expect(v.code).toBe('sequence');
    expect(v.details.join(' ')).toContain('concurrente');
  });

  // Même principe que `--expect ""` dans check-cid.mjs : une attente vide doit
  // faire échouer le contrôle, jamais le rendre permissif.
  it.each([
    ['value vide', { value: '', sequence: 1n }],
    ['value absente', { sequence: 1n }],
    ['sequence absente', { value: CID_A }],
    ['sequence illisible', { value: CID_A, sequence: 'plus tard' }],
  ])('refuse de valider quand la révision signée est inexploitable (%s)', (_, signe) => {
    const v = verdictDeRelecture(signe, { value: CID_A, sequence: 1n });
    expect(v.ok).toBe(false);
    expect(v.code).toBe('invalide');
  });

  it('n’accepte jamais deux révisions vides comme identiques', () => {
    const v = verdictDeRelecture({ value: '', sequence: undefined }, { value: '', sequence: undefined });
    expect(v.ok).toBe(false);
  });
});

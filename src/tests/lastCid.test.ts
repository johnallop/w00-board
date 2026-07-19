import { describe, it, expect } from 'vitest';
import { dernierCidConnu } from '../../scripts/lib/last-cid.mjs';

// Format écrit par deploy.yml, étape « Tracer le CID sur la branche ipfs-history » :
//   echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') ${GITHUB_SHA} ${{ steps.pack.outputs.cid }}"
const CID_A = 'bafybeih72jcva24dzyr3abeonigo523ssqyr54hmt3rjdkfy2zxjegi5u4';
const CID_B = 'bafybeidhfevo7d3mzvvwvbnwmqtgm5xr7dkuk5hbwtjzwqjqhqvbxq5ova';
const SHA_A = '4f3a1c9e2b7d8054aa61f39c0e5b72d84c1a6f30';
const SHA_B = '9e2d7c04b1a3f865de92c07b4a15e83f6d20c9b7';

const ligne = (date: string, sha: string, cid: string) => `${date} ${sha} ${cid}`;

describe('dernierCidConnu', () => {
  it('lit le CID, le commit et l’horodatage de la dernière entrée', () => {
    const journal = [
      ligne('2026-07-11T08:03:14Z', SHA_A, CID_A),
      ligne('2026-07-18T09:17:03Z', SHA_B, CID_B),
      '',
    ].join('\n');

    const r = dernierCidConnu(journal);
    expect(r.ok).toBe(true);
    expect(r.cid).toBe(CID_B);
    expect(r.sha).toBe(SHA_B);
    expect(r.date).toBe('2026-07-18T09:17:03Z');
  });

  /*
   * LE CAS DÉCISIF — c'est tout l'objet du module.
   *
   * Avant : heartbeat.yml rebuildait et republiait le CID qu'il venait de
   * calculer, quel qu'il soit. Ici la dernière entrée du journal (CID_B) est la
   * seule attestation d'un épinglage ; un CID recalculé qui divergerait ne doit
   * jamais pouvoir prendre sa place. La fonction ne renvoie donc QUE ce que le
   * journal atteste — elle n'a aucune autre source.
   */
  it('renvoie la dernière entrée, jamais une antérieure', () => {
    const journal = [
      ligne('2026-07-11T08:03:14Z', SHA_A, CID_A),
      ligne('2026-07-18T09:17:03Z', SHA_B, CID_B),
    ].join('\n');

    expect(dernierCidConnu(journal).cid).toBe(CID_B);
    expect(dernierCidConnu(journal).cid).not.toBe(CID_A);
  });

  it('accepte un journal d’une seule entrée (premier déploiement)', () => {
    const r = dernierCidConnu(ligne('2026-07-11T08:03:14Z', SHA_A, CID_A));
    expect(r.ok).toBe(true);
    expect(r.cid).toBe(CID_A);
  });

  // CIDS.log est écrit par un runner Linux, mais rien ne garantit qu'il soit lu
  // par un. Un \r résiduel collé au CID le rendrait « malformé » à tort.
  it('tolère les fins de ligne CRLF', () => {
    const journal = `${ligne('2026-07-11T08:03:14Z', SHA_A, CID_A)}\r\n${ligne('2026-07-18T09:17:03Z', SHA_B, CID_B)}\r\n`;
    const r = dernierCidConnu(journal);
    expect(r.ok).toBe(true);
    expect(r.cid).toBe(CID_B);
  });

  it.each([
    ['journal absent', undefined],
    ['journal null', null],
    ['chaîne vide', ''],
    ['lignes vides seulement', '\n\n  \n'],
  ])('refuse quand rien n’a été épinglé (%s)', (_, contenu) => {
    const r = dernierCidConnu(contenu as string | null | undefined);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('vide');
    expect(r.cid).toBeNull();
  });

  /*
   * Le refus de retomber sur l'entrée précédente.
   *
   * Tentant : la ligne d'avant est valide, on pourrait « se rattraper ». Mais
   * republier CID_A alors que CID_B est épinglé ferait reculer le miroir d'un
   * déploiement, silencieusement — un retour en arrière déguisé en heartbeat
   * réussi. Un journal qu'on ne comprend plus doit arrêter la publication, pas
   * la dévier.
   */
  it('ne retombe PAS sur l’entrée précédente si la dernière est illisible', () => {
    const journal = [ligne('2026-07-11T08:03:14Z', SHA_A, CID_A), 'cid: bafy…tronqué'].join('\n');

    const r = dernierCidConnu(journal);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('illisible');
    expect(r.cid).toBeNull();
    expect(r.cid).not.toBe(CID_A);
  });

  it.each([
    ['deux champs', `2026-07-18T09:17:03Z ${CID_B}`],
    ['quatre champs', `${ligne('2026-07-18T09:17:03Z', SHA_B, CID_B)} extra`],
    ['un seul champ', CID_B],
  ])('refuse une ligne au mauvais nombre de champs (%s)', (_, derniere) => {
    const r = dernierCidConnu(`${ligne('2026-07-11T08:03:14Z', SHA_A, CID_A)}\n${derniere}`);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('illisible');
  });

  it.each([
    ['CID tronqué', ligne('2026-07-18T09:17:03Z', SHA_B, 'bafybeih72jcva24')],
    ['CIDv0', ligne('2026-07-18T09:17:03Z', SHA_B, 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')],
    ['CID en base32 majuscule', ligne('2026-07-18T09:17:03Z', SHA_B, CID_B.toUpperCase())],
    ['sha court', ligne('2026-07-18T09:17:03Z', '4f3a1c9', CID_B)],
    ['sha non hexadécimal', ligne('2026-07-18T09:17:03Z', 'z'.repeat(40), CID_B)],
  ])('refuse une ligne au mauvais format (%s)', (_, derniere) => {
    const r = dernierCidConnu(derniere);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('format');
    expect(r.cid).toBeNull();
  });

  /*
   * Le champ CID est identifié par sa POSITION, pas par sa forme. Si deploy.yml
   * réordonnait ses colonnes, un journal « bien formé » livrerait un sha à la
   * place d'un CID. La validation croisée des deux champs rend ce glissement
   * détectable au lieu de le laisser produire un CID absurde.
   */
  it('détecte une inversion des colonnes sha et cid', () => {
    const r = dernierCidConnu(`2026-07-18T09:17:03Z ${CID_B} ${SHA_B}`);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('format');
  });

  it('expose de quoi diagnostiquer sans relire le fichier', () => {
    const r = dernierCidConnu(ligne('2026-07-18T09:17:03Z', SHA_B, 'bafy-pas-un-cid'));
    expect(r.resume).toBeTruthy();
    expect(r.details.join(' ')).toContain('bafy-pas-un-cid');
  });
});

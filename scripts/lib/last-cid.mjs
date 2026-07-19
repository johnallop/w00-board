/**
 * Lecture du dernier CID réellement épinglé, depuis CIDS.log.
 *
 * POURQUOI CE MODULE EXISTE
 *
 * Le heartbeat hebdomadaire republie le nom IPNS pour le garder chaud. Jusqu'ici
 * il obtenait « le » CID en rebuildant le site et en le packant lui-même :
 *
 *     npm run build
 *     CID=$(npx ipfs-car pack dist --no-wrap --output w00.car)
 *
 * Ce CID n'était confronté à rien. Il coïncidait avec celui de deploy.yml par
 * chance — même package-lock.json, build reproductible — et rien ne garantissait
 * que ça dure : une option d'ipfs-car qui change, une version qui bouge, un
 * `main` qui a avancé sans déploiement, et le heartbeat ferait pointer le nom
 * vers un CID que PERSONNE n'a épinglé. Le nom résoudrait, la relecture de
 * scripts/lib/ipns-verdict.mjs serait verte — elle vérifie que le nom désigne ce
 * qu'on a signé, pas que ce qu'on a signé existe — et les passerelles
 * renverraient une erreur de récupération.
 *
 * Le heartbeat ne calcule donc plus rien. CIDS.log, écrit par deploy.yml APRÈS
 * un `w3 up` réussi, est la seule attestation qu'un CID est épinglé ; c'est elle
 * qui fait autorité. Ce module la lit, et refuse plutôt que de deviner.
 *
 * FORMAT (deploy.yml, étape « Tracer le CID sur la branche ipfs-history ») :
 *
 *     2026-07-18T09:17:03Z 4f3a…(40 hex) bafybeih72jcva24…
 *     ─ horodatage ISO ──  ─ commit ───  ─ CIDv1 base32 ─
 *
 * La DERNIÈRE ligne fait foi, pas l'horodatage le plus élevé : les entrées sont
 * ajoutées par `git commit` + `git push` sur une branche unique, donc git
 * sérialise déjà les écritures concurrentes (le second push est rejeté, pas
 * entrelacé). L'ordre du fichier EST l'ordre des épinglages.
 *
 * Fonction pure, sans I/O — testée dans src/tests/lastCid.test.ts.
 */

/** CIDv1 base32 tel que produit par ipfs-car (dag-pb + sha2-256 → préfixe bafy). */
const CID_V1_BASE32 = /^bafy[a-z2-7]{50,}$/;

/** SHA de commit git complet, tel qu'écrit par `${GITHUB_SHA}`. */
const SHA_COMPLET = /^[0-9a-f]{40}$/;

/**
 * Extrait le dernier CID épinglé du contenu de CIDS.log.
 *
 * Trois refus explicites plutôt qu'une valeur par défaut. Chacun couvre un cas
 * où « deviner » reviendrait à republier un CID dont on n'est pas sûr :
 *
 *   'vide'      — journal absent ou sans entrée : rien n'a jamais été épinglé,
 *                 il n'y a donc pas de nom à garder chaud.
 *   'illisible' — la dernière ligne n'a pas la forme attendue. On ne remonte PAS
 *                 à la dernière ligne valide : une ligne finale corrompue veut
 *                 dire qu'on ne comprend plus le fichier, et republier l'entrée
 *                 d'avant reviendrait à faire reculer le site d'un déploiement
 *                 en silence — exactement le genre de régression discrète que
 *                 tout ce travail cherche à rendre bruyante.
 *   'format'    — les champs sont là mais pas à leur place attendue. Sépare une
 *                 vraie corruption d'un changement de format de deploy.yml : le
 *                 second se corrige en une ligne, encore faut-il le distinguer.
 *
 * @param {string | null | undefined} contenu contenu brut de CIDS.log
 * @returns {{ ok: boolean, code: string, cid: string|null, sha: string|null, date: string|null, resume: string, details: string[] }}
 */
export function dernierCidConnu(contenu) {
  const lignes = String(contenu ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const echec = (code, resume, details) => ({
    ok: false,
    code,
    cid: null,
    sha: null,
    date: null,
    resume,
    details,
  });

  if (lignes.length === 0) {
    return echec('vide', 'CIDS.log ne contient aucune entrée épinglée.', [
      'Aucun déploiement n’a encore atteint l’étape « Tracer le CID ».',
      'Il n’y a donc pas d’enregistrement IPNS à rafraîchir.',
    ]);
  }

  const derniere = lignes[lignes.length - 1];
  const champs = derniere.split(/\s+/);

  if (champs.length !== 3) {
    return echec('illisible', 'La dernière ligne de CIDS.log est inexploitable.', [
      `ligne  : ${derniere}`,
      `attendu: <horodatage> <sha> <cid> — ${champs.length} champ(s) trouvé(s), 3 attendus`,
      'Republier l’entrée précédente ferait reculer le site sans le dire : on refuse.',
    ]);
  }

  const [date, sha, cid] = champs;

  if (!SHA_COMPLET.test(sha) || !CID_V1_BASE32.test(cid)) {
    return echec('format', 'CIDS.log ne respecte plus le format attendu.', [
      `ligne     : ${derniere}`,
      `champ sha : ${sha} ${SHA_COMPLET.test(sha) ? '(ok)' : '(40 caractères hexadécimaux attendus)'}`,
      `champ cid : ${cid} ${CID_V1_BASE32.test(cid) ? '(ok)' : '(CIDv1 base32 « bafy… » attendu)'}`,
      'Si deploy.yml a changé de format, aligner scripts/lib/last-cid.mjs.',
    ]);
  }

  return {
    ok: true,
    code: 'ok',
    cid,
    sha,
    date,
    resume: `Dernier CID épinglé : ${cid} (commit ${sha.slice(0, 7)}, ${date}).`,
    details: [`${lignes.length} entrée(s) dans CIDS.log`, `source : ${derniere}`],
  };
}

/**
 * Relecture après publication IPNS sur Filebase : le nom désigne-t-il vraiment
 * ce qu'on vient de publier, et le réseau le voit-il ?
 *
 * L'étape « Publier IPNS » de deploy.yml porte `continue-on-error` (à raison :
 * un miroir muet ne doit pas casser un déploiement réussi), donc son code de
 * retour ne se voit nulle part. D'où une relecture qui rend un verdict
 * explicite, affiché dans le résumé de job, succès comme échec.
 *
 * TROIS contrôles, parce que chacun est aveugle à un cas que l'autre voit :
 *
 *   1. L'API. L'entrée relue doit porter le nom public du site (network_key =
 *      IPNS_NAME de src/data/ipfs.ts) et le CID qu'on vient de publier.
 *
 *   2. LA SÉQUENCE. Filebase accepte un PUT (HTTP 200) sans republier quand le
 *      CID est inchangé (mesuré le 2026-11-15 : séquence 1 → 1, enregistrement
 *      réseau identique). Une réponse 200 et un CID relu conformes ne prouvent
 *      donc pas qu'un enregistrement neuf a été signé : seule une séquence qui
 *      avance le prouve.
 *
 *   3. LA PASSERELLE. Le nom doit se résoudre sur le réseau vers ce CID
 *      (en-tête X-Ipfs-Roots de ipfs.filebase.io). C'est la leçon de w3name :
 *      son API relisait un enregistrement « conforme » que ni la passerelle
 *      Filebase ni le routage IPFS ne trouvaient (constaté le 2026-11-15).
 *      Une relecture par la seule API du publieur ne prouve pas que le nom
 *      marche.
 *
 * Tout écart bloque : la différence d'urgence entre les cas vit dans `details`,
 * à destination de l'humain qui lit le résumé, pas dans un niveau de gravité
 * qu'un code finirait par brancher sur une décision.
 *
 * Fonctions pures, sans I/O — testées dans src/tests/ipnsVerdict.test.ts.
 */

/** CIDv1 base32 tel que produit par ipfs-car. */
const CID_V1_BASE32 = /^bafy[a-z2-7]{50,}$/;

/**
 * Ramène une séquence à un BigInt, quelle que soit sa représentation d'origine
 * (Number dans le JSON de l'API, string ou BigInt ailleurs).
 *
 * @returns {bigint | null} null si la valeur n'est pas un entier naturel exploitable
 */
export function versSequence(valeur) {
  if (typeof valeur === 'bigint') return valeur >= 0n ? valeur : null;
  if (typeof valeur === 'number') return Number.isInteger(valeur) && valeur >= 0 ? BigInt(valeur) : null;
  if (typeof valeur === 'string' && /^\d+$/.test(valeur)) return BigInt(valeur);
  return null;
}

/**
 * CID racine servi par une passerelle, lu dans l'en-tête X-Ipfs-Roots.
 *
 * La passerelle liste les racines du chemin résolu, de la racine du site vers
 * le fichier demandé (mesuré le 2026-11-15 sur /ipns/<nom>/build.json :
 * `<CID du site>,<CID de build.json>`). Seule la première désigne le site.
 *
 * @param {string | null | undefined} entete valeur brute de X-Ipfs-Roots
 * @returns {string | null}
 */
export function racineServie(entete) {
  const premiere = String(entete ?? '').split(',')[0].trim();
  return CID_V1_BASE32.test(premiere) ? premiere : null;
}

/**
 * Confronte l'état relu à ce qu'on vient de publier.
 *
 * @param {object} p
 * @param {string} p.cid CID publié
 * @param {string} p.nom nom public attendu (IPNS_NAME)
 * @param {{ sequence?: unknown } | null} p.avant entrée de l'API avant publication (null si absente)
 * @param {{ network_key?: string, cid?: string, sequence?: unknown, published_at?: string|null } | null} p.apres entrée relue après publication
 * @param {string | null} p.racine CID servi par la passerelle sous le nom (null si injoignable)
 * @returns {{ ok: boolean, code: string, resume: string, details: string[] }}
 */
export function verdictDeRelecture({ cid, nom, avant, apres, racine }) {
  // Une attente vide ne doit JAMAIS passer pour un succès : ce serait un
  // contrôle qui se désactive tout seul (même principe que `--expect ""`
  // dans check-cid.mjs).
  if (!CID_V1_BASE32.test(String(cid ?? '')) || !nom) {
    return {
      ok: false,
      code: 'invalide',
      resume: 'Attente inexploitable — vérification impossible.',
      details: [`cid : ${JSON.stringify(cid ?? null)}`, `nom : ${JSON.stringify(nom ?? null)}`],
    };
  }

  if (!apres) {
    return {
      ok: false,
      code: 'absent',
      resume: 'Le nom est introuvable dans l’API Filebase.',
      details: [`attendu : ${nom} → /ipfs/${cid}`, 'Le nom a-t-il été supprimé ou renommé sur Filebase ?'],
    };
  }

  if (apres.network_key !== nom) {
    return {
      ok: false,
      code: 'nom',
      resume: 'Le label Filebase désigne un autre nom public que celui affiché par le site.',
      details: [
        `attendu (src/data/ipfs.ts) : ${nom}`,
        `obtenu (API Filebase)      : ${apres.network_key ?? '(absent)'}`,
        'Le footer pointerait vers un nom que ce déploiement ne met pas à jour.',
      ],
    };
  }

  if (apres.cid !== cid) {
    return {
      ok: false,
      code: 'valeur',
      resume: 'Le nom IPNS désigne un autre contenu que celui qui vient d’être épinglé.',
      details: [
        `attendu : ${cid}`,
        `obtenu  : ${apres.cid || '(vide)'}`,
        'Les visiteurs du miroir voient une version antérieure du site.',
      ],
    };
  }

  const seqAvant = avant ? versSequence(avant.sequence) : null;
  const seqApres = versSequence(apres.sequence);
  if (seqApres === null || (seqAvant !== null && seqApres <= seqAvant)) {
    return {
      ok: false,
      code: 'sequence',
      resume: 'Le contenu pointé est correct, mais l’enregistrement n’a pas été republié.',
      details: [
        `séquence avant : ${seqAvant ?? '(aucune)'}`,
        `séquence après : ${seqApres ?? '(illisible)'}`,
        'Filebase répond 200 sans republier quand le CID est inchangé (relance d’un même déploiement ?).',
      ],
    };
  }

  if (racine !== cid) {
    return {
      ok: false,
      code: 'passerelle',
      resume: 'L’API est à jour, mais la passerelle ne sert pas ce CID sous le nom.',
      details: [
        `attendu : ${cid}`,
        `servi   : ${racine ?? '(rien — nom non résolu ou passerelle injoignable)'}`,
        'Le nom ne marche pas sur le réseau tant que la passerelle ne le résout pas.',
      ],
    };
  }

  return {
    ok: true,
    code: 'ok',
    resume: `Nom republié et résolu sur le réseau (seq ${seqApres}).`,
    details: [`${nom} → /ipfs/${cid}`, `publié : ${apres.published_at ?? '(date non fournie)'}`],
  };
}

/** Clé CBOR « Validity » : en-tête de chaîne de texte de 8 octets (0x68) + la clé. */
const CLE_VALIDITE = Buffer.from([0x68, ...Buffer.from('Validity', 'latin1')]);
const RFC3339_UTC = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/;

/**
 * Date d'expiration d'un enregistrement IPNS, lue dans son champ CBOR
 * `Validity` (chaîne d'octets RFC 3339).
 *
 * Seul le format V2 (données CBOR) est lu : c'est celui que Filebase publie
 * (mesuré le 2026-11-16 via delegated-ipfs.dev : 221 octets, aucun champ V1).
 * Le reste de l'enregistrement — signature comprise — n'est pas vérifié : on
 * ne lit qu'une échéance, à seule fin d'alerter avant qu'elle tombe.
 *
 * @param {Uint8Array | null | undefined} octets enregistrement brut
 *   (`application/vnd.ipfs.ipns-record`)
 * @returns {Date | null} null si l'enregistrement est absent ou illisible
 */
export function validiteDuRecord(octets) {
  if (!octets || octets.length === 0) return null;
  const tampon = Buffer.from(octets);
  const i = tampon.indexOf(CLE_VALIDITE);
  if (i === -1) return null;

  // Valeur : chaîne d'octets CBOR (type majeur 2), longueur dans l'en-tête
  // (0x40-0x57) ou sur l'octet suivant (0x58).
  let pos = i + CLE_VALIDITE.length;
  const entete = tampon[pos++];
  let longueur;
  if (entete >= 0x40 && entete <= 0x57) longueur = entete - 0x40;
  else if (entete === 0x58 && pos < tampon.length) longueur = tampon[pos++];
  else return null;
  if (pos + longueur > tampon.length) return null;

  // Filebase écrit des nanosecondes (« .729000000Z ») : on tronque à la
  // milliseconde plutôt que de dépendre de la tolérance de Date.parse.
  const m = tampon.subarray(pos, pos + longueur).toString('latin1').match(RFC3339_UTC);
  if (!m) return null;
  const date = new Date(`${m[1]}.${(m[2] ?? '').padEnd(3, '0').slice(0, 3)}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Surveillance quotidienne (heartbeat) : le nom désigne-t-il toujours le
 * dernier CID épinglé, et lui reste-t-il assez de validité ?
 *
 * Le heartbeat ne publie plus : un PUT au même CID est ignoré par Filebase
 * (voir contrôle 2 ci-dessus), il ne peut donc pas prolonger l'enregistrement.
 * C'est Filebase qui le re-signe de lui-même, séquence inchangée et échéance
 * repoussée (mesuré : enregistrement créé le 2026-11-15 à 05:46 UTC, re-signé
 * le 2026-11-16 à 00:00:21 UTC). Ce renouvellement n'est pas documenté : on
 * vérifie qu'il a lieu, et on alerte AVANT l'échéance s'il cesse.
 *
 * Un cache du routage délégué peut servir un enregistrement plus ancien
 * (constaté une fois, ~5 min) : l'échéance lue est alors plus proche que la
 * vraie. L'erreur ne peut aller que vers une alerte, jamais vers un faux vert.
 *
 * Reprend les contrôles API et passerelle de verdictDeRelecture (sans
 * séquence de référence : rien n'a été publié), puis ajoute l'échéance lue
 * dans l'enregistrement que le routage IPFS distribue — pas dans l'API du
 * publieur, pour la même raison que le contrôle 3.
 *
 * @param {object} p
 * @param {string} p.cid dernier CID épinglé (CIDS.log)
 * @param {string} p.nom nom public attendu (IPNS_NAME)
 * @param {object | null} p.entree entrée relue dans l'API Filebase
 * @param {string | null} p.racine CID servi par la passerelle sous le nom
 * @param {Date | null} p.validite échéance lue par validiteDuRecord
 * @param {Date} p.maintenant
 * @param {number} p.margeMs validité restante minimale exigée
 * @returns {{ ok: boolean, code: string, resume: string, details: string[] }}
 */
export function verdictDeSurveillance({ cid, nom, entree, racine, validite, maintenant, margeMs }) {
  const base = verdictDeRelecture({ cid, nom, avant: null, apres: entree, racine });
  if (!base.ok) return base;

  if (!(validite instanceof Date) || Number.isNaN(validite.getTime())) {
    return {
      ok: false,
      code: 'routage',
      resume: 'Le routage IPFS ne distribue pas d’enregistrement lisible pour ce nom.',
      details: [`nom : ${nom}`, 'Sans enregistrement sur le réseau, le nom cesse de se résoudre dès que les caches expirent.'],
    };
  }

  const resteMs = validite.getTime() - maintenant.getTime();
  const heures = (resteMs / 3_600_000).toFixed(1);
  if (resteMs < margeMs) {
    return {
      ok: false,
      code: 'expiration',
      resume:
        resteMs > 0
          ? `L’enregistrement IPNS expire dans ${heures} h (${validite.toISOString()}) et rien ne le republie.`
          : `L’enregistrement IPNS a expiré le ${validite.toISOString()}.`,
      details: [
        `seuil d’alerte : ${margeMs / 3_600_000} h de validité restante`,
        'Filebase n’a pas renouvelé l’enregistrement, et un PUT au même CID n’y change rien.',
        'Un déploiement (nouveau CID) republie le nom.',
      ],
    };
  }

  return {
    ok: true,
    code: 'ok',
    resume: `Nom résolu sur le dernier CID épinglé, valide jusqu’au ${validite.toISOString()} (encore ${heures} h).`,
    details: [`${nom} → /ipfs/${cid}`],
  };
}

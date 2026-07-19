/**
 * Relecture après publication IPNS : le nom désigne-t-il vraiment ce qu'on
 * vient de signer ?
 *
 * `Name.publish` peut échouer — ou pire, sembler réussir — sans que rien ne
 * l'indique. L'étape « Publier IPNS » de deploy.yml porte `continue-on-error`
 * (à raison : un miroir muet ne doit pas casser un déploiement réussi), donc
 * son code de retour ne se voit nulle part. Le pin réussit, CIDS.log enregistre
 * le CID, le résumé annonce fièrement une URL IPNS — et le nom peut continuer
 * à désigner l'avant-dernier contenu.
 *
 * DEUX contrôles, parce qu'un seul est aveugle à la moitié des cas :
 *
 *   1. LA VALEUR. `/ipfs/<CID>` relu doit être celui qu'on vient de signer.
 *      Suffisant quand le CID change (chaque push de deploy.yml).
 *
 *   2. LA SÉQUENCE. Le heartbeat hebdomadaire republie le MÊME CID pour garder
 *      l'enregistrement chaud (validité ~1 an côté w3name). Là, la valeur relue
 *      est identique que la publication ait abouti ou non : le contrôle 1 est
 *      VERT PAR CONSTRUCTION, et `Name.publish` pourrait échouer toutes les
 *      semaines pendant un an avant que le nom n'expire pour de bon. Le numéro
 *      de séquence est le seul discriminant entre « republié » et « inchangé ».
 *
 * Piège mesuré : `revision.sequence` est un **BigInt**. `seq === 1` vaut `false`
 * là où `seq == 1` vaut `true`, et `JSON.stringify` lève sur un BigInt. D'où la
 * normalisation systématique ci-dessous plutôt qu'une comparaison directe.
 *
 * Fonction pure, sans I/O — testée dans src/tests/ipnsVerdict.test.ts, parce que
 * `Name.publish` ne peut pas l'être : publier depuis un poste de développement
 * écrirait sur le vrai nom public du site.
 */

/**
 * Ramène une séquence à un BigInt, quelle que soit sa représentation d'origine
 * (BigInt côté w3name, Number ou string ailleurs).
 *
 * @returns {bigint | null} null si la valeur n'est pas un entier naturel exploitable
 */
export function versSequence(valeur) {
  if (typeof valeur === 'bigint') return valeur >= 0n ? valeur : null;
  if (typeof valeur === 'number') return Number.isInteger(valeur) && valeur >= 0 ? BigInt(valeur) : null;
  if (typeof valeur === 'string' && /^\d+$/.test(valeur)) return BigInt(valeur);
  return null;
}

/*
 * POURQUOI IL N'Y A PAS DE NIVEAU DE GRAVITÉ.
 *
 * Ce module a porté un temps une fonction `graviteDeLEcart(code)` censée
 * distinguer deux urgences :
 *
 *   'valeur'   — le nom pointe vers un AUTRE contenu que celui qu'on vient
 *                d'épingler. Visible par les visiteurs du miroir, maintenant.
 *   'sequence' — le nom pointe vers le BON contenu, mais l'enregistrement n'a
 *                pas été rafraîchi. Rien de cassé aujourd'hui ; l'enregistrement
 *                expire dans ~1 an.
 *
 * La distinction est juste, et la conclusion qu'on en tire naturellement —
 * « donc 'sequence' ne devrait pas bloquer » — est fausse. 'sequence' est le
 * signal PROPRE du heartbeat : c'est le seul code que ce workflow puisse
 * produire quand `Name.publish` échoue, puisqu'il republie le même CID et que
 * la valeur relue reste donc conforme (voir l'en-tête de ce fichier, contrôle
 * 2). Le rendre non bloquant remettrait le heartbeat exactement dans l'état
 * qu'il a été écrit pour supprimer : vert toutes les semaines pendant un an,
 * jusqu'à expiration réelle du nom.
 *
 * Le champ `gravite` renvoyé avec le verdict n'était par ailleurs lu nulle
 * part — ni par update-ipns.mjs, ni par les tests, ni par les deux workflows.
 * Un champ calculé que personne ne consulte finit par se faire brancher un jour
 * sur une décision, par quelqu'un qui n'aura pas relu l'en-tête. Il est donc
 * supprimé plutôt que laissé en attente : la règle est « tout écart bloque »,
 * et c'est une conclusion, pas un placeholder.
 *
 * La différence d'urgence n'est pas perdue pour autant — elle vit dans
 * `details`, à destination de l'humain qui lit le résumé de job, qui est le
 * seul à pouvoir en faire quelque chose.
 */

/**
 * Confronte la révision relue à celle qu'on vient de publier.
 *
 * @param {{ value?: string, sequence?: unknown }} signe révision signée puis publiée
 * @param {{ value?: string, sequence?: unknown } | null} relu réponse de Name.resolve, ou null si le nom ne résout pas
 * @returns {{ ok: boolean, code: string, resume: string, details: string[] }}
 */
export function verdictDeRelecture(signe, relu) {
  const attendue = versSequence(signe?.sequence);
  const attendu = typeof signe?.value === 'string' ? signe.value : '';

  // Une attente vide ne doit JAMAIS passer pour un succès : ce serait un
  // contrôle qui se désactive tout seul, exactement le travers que
  // check-cid.mjs refuse sur `--expect ""`.
  if (!attendu || attendue === null) {
    return {
      ok: false,
      code: 'invalide',
      resume: 'Révision signée inexploitable — vérification impossible.',
      details: [
        `value signée    : ${JSON.stringify(signe?.value ?? null)}`,
        `sequence signée : ${String(signe?.sequence)} (${typeof signe?.sequence})`,
      ],
    };
  }

  if (!relu) {
    return {
      ok: false,
      code: 'absent',
      resume: 'Le nom ne résout pas après publication.',
      details: [
        `attendu : ${attendu} (seq ${attendue})`,
        'Name.resolve lève « record not found » : rien n’a été enregistré.',
      ],
    };
  }

  const obtenue = versSequence(relu.sequence);
  const obtenu = typeof relu.value === 'string' ? relu.value : '';

  if (obtenu !== attendu) {
    return {
      ok: false,
      code: 'valeur',
      resume: 'Le nom IPNS désigne un autre contenu que celui qui vient d’être épinglé.',
      details: [
        `attendu : ${attendu} (seq ${attendue})`,
        `obtenu  : ${obtenu || '(vide)'} (seq ${obtenue ?? '?'})`,
        'Les visiteurs du miroir voient une version antérieure du site.',
      ],
    };
  }

  if (obtenue === null || obtenue !== attendue) {
    // Séquence en retard  → notre publication n'a pas abouti (cas heartbeat).
    // Séquence en avance  → une autre publication est passée après la nôtre.
    const sens =
      obtenue !== null && obtenue > attendue
        ? 'Une publication concurrente est passée après la nôtre.'
        : 'La publication n’a pas abouti : l’enregistrement précédent est toujours en place.';
    return {
      ok: false,
      code: 'sequence',
      resume: 'Le contenu pointé est correct, mais l’enregistrement n’a pas été rafraîchi.',
      details: [
        `séquence attendue : ${attendue}`,
        `séquence obtenue  : ${obtenue ?? '(illisible)'}`,
        sens,
        'La valeur seule ne pouvait pas le voir : le heartbeat republie le même CID.',
      ],
    };
  }

  return {
    ok: true,
    code: 'ok',
    resume: `Nom relu et conforme (seq ${attendue}).`,
    details: [`${attendu} (seq ${attendue})`],
  };
}

import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

/**
 * Énumère les sous-ressources hachées du build, pour que le service worker
 * puisse les précacher.
 *
 * LE DÉFAUT QUE CE FICHIER RÉPARE. `cache.add(url)` ne récupère QUE les octets
 * du document : le navigateur n'analyse pas le HTML qu'il vient de cacher, donc
 * ne suit ni les `<link>` ni les `<script>`. Le précache contenait les pages et
 * les polices, mais aucun des `_astro/*` qu'elles réclament — et le résultat
 * était pire que rien : la page ÉTANT cachée, le worker la servait hors ligne,
 * nue, au lieu de laisser la réponse 503 « Connexion perdue » faire son travail.
 *
 * POURQUOI UN HOOK DE BUILD, ET PAS AILLEURS. Trois autres emplacements ont été
 * essayés puis écartés, chacun sur une preuve :
 *
 *  - Faire analyser au worker le HTML qu'il vient de cacher. Aucun HTML du site
 *    ne nomme le chunk `Layout.astro_astro_type_script_…js`, et il n'y a aucun
 *    `modulepreload` : ce chunk n'est atteint que par un `import` en tête des
 *    `hoisted.*.js`. Une analyse du HTML le manquerait systématiquement.
 *
 *  - Faire lire `dist/_astro` par la route `sw.js.ts`. Astro rend les routes
 *    AVANT d'émettre dist/, et surtout check-reproducible.mjs rebâtit avec
 *    `--outDir ailleurs` : la route lirait le build PRÉCÉDENT tout en écrivant
 *    ailleurs. Les deux passes concorderaient sur des octets dérivés d'une
 *    source périmée, et le contrôle de reproductibilité passerait au vert en
 *    certifiant un précache qui nomme les hachages d'hier.
 *
 *  - Réécrire `dist/sw.js` après coup. L'artefact minifié ne dirait alors plus
 *    la même chose que la route, et serviceWorker.test.ts confronte justement
 *    les deux (`expect(dist).toEqual(route)`).
 *
 * Le hook `astro:build:done` reçoit `{ dir }` — le répertoire RÉELLEMENT écrit.
 * C'est la seule source qui suive `--outDir`, donc la seule qui reste vraie
 * sous check-reproducible.mjs.
 *
 * POURQUOI TOUT `_astro/`, SANS RÉSOLUTION PAR PAGE. Le répertoire pèse neuf
 * fichiers pour 35 Ko. Résoudre quelles pages réclament quels fichiers
 * demanderait de suivre les imports transitifs du JavaScript émis — beaucoup de
 * machinerie fragile pour économiser quelques dizaines de kilo-octets. Prendre
 * le répertoire entier est exact par construction : aucun graphe à tenir à jour,
 * donc aucun graphe qui puisse mentir.
 */

/** Le chemin servi, tel que le worker le demandera. */
export const CHEMIN_MANIFESTE = '/precache-assets.json';

/** Le répertoire qu'Astro remplit d'artefacts hachés. */
export const DOSSIER_ASSETS = '_astro';

/**
 * Les sous-ressources hachées de `racine`, en chemins absolus servis, triés.
 *
 * Le tri est explicite pour la même raison que dans sw.js.ts : readdirSync ne
 * garantit aucun ordre, et un ordre qui flotte ferait varier les octets du
 * manifeste d'un build à l'autre — check-reproducible.mjs le refuserait, à
 * juste titre, puisque « les octets ne varient QUE par des entrées déclarées ».
 *
 * Un répertoire absent rend une liste vide plutôt que de lever : un site sans
 * sous-ressource est concevable. Ce n'en est pas moins une dérive POUR CE
 * dépôt-ci, et c'est serviceWorker.test.ts qui la refuse, au build — même
 * partage que l'installation du worker : tolérer l'accident, refuser la dérive.
 */
export function listerSousRessources(racine: string): string[] {
  const dossier = join(racine, DOSSIER_ASSETS);
  if (!existsSync(dossier)) return [];

  return readdirSync(dossier)
    .filter((nom) => statSync(join(dossier, nom)).isFile())
    .sort()
    .map((nom) => '/' + DOSSIER_ASSETS + '/' + nom);
}

/**
 * L'intégration qui dépose le manifeste à côté des fichiers qu'il nomme.
 *
 * Le fichier est écrit avec un saut de ligne final et une indentation stable :
 * il doit être lisible par un humain qui inspecte un déploiement, et
 * bit-à-bit identique d'un build à l'autre pour la même entrée.
 */
export function precacheManifeste(): AstroIntegration {
  return {
    name: 'w00-precache-manifeste',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const racine = fileURLToPath(dir);
        const liste = listerSousRessources(racine);

        writeFileSync(
          join(racine, CHEMIN_MANIFESTE.slice(1)),
          JSON.stringify(liste, null, 2) + '\n',
          'utf8'
        );

        // Un build muet sur ce point rendrait une liste vide indiscernable d'une
        // liste correcte, dans les journaux de CI comme en local.
        console.log(
          '[w00] ' + CHEMIN_MANIFESTE + ' — ' + liste.length + ' sous-ressource(s) à précacher'
        );
      },
    },
  };
}

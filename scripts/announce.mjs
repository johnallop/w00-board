/**
 * Script d'annonce et de pings de découverte (IndexNow, WebSub, Wayback Machine).
 *
 * Usage :
 *   node scripts/announce.mjs [--prev prev-config.json] [--curr src/data/config.json]
 */

import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { diffBillboards } from './lib/diff-billboards.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Signale une anomalie ailleurs que dans le corps des logs.
 *
 * Les pings de découverte tournent sous `continue-on-error: true` : un
 * `console.warn` y est enterré au milieu de plusieurs centaines de lignes, dans
 * un job que personne n'ouvre puisqu'il est vert par construction. C'est ainsi
 * que la clé IndexNow a pu être invalide sans que rien ne le signale.
 *
 * `::warning::` remonte l'anomalie dans le résumé de l'exécution, en tête de
 * page, sans faire échouer quoi que ce soit — ce qui reste le bon compromis
 * pour un canal dont l'indisponibilité ne doit pas bloquer un déploiement.
 */
function avertir(message) {
  const ligne = String(message).replace(/\r?\n/g, ' ');
  console.warn(`⚠️ ${ligne}`);
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::warning title=Ping de découverte::${ligne}`);
  }
}

/**
 * La clé IndexNow, lue depuis le nom du fichier qui la publie.
 *
 * POURQUOI ELLE N'EST PLUS ÉCRITE ICI.
 *
 * Elle l'était, et sa jumelle vivait dans `public/<clé>.txt`. Les deux étaient
 * d'accord — sur une valeur que le protocole refuse :
 * `e7a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5` contient `g h i j k l m n o`, alors
 * qu'IndexNow exige une clé strictement hexadécimale. Le canal d'indexation le
 * plus rapide du pipeline était donc rejeté à chaque appel depuis sa mise en
 * place, et le seul témoin était un `console.warn` dans un job en
 * `continue-on-error`.
 *
 * Deux copies d'un même fait ne peuvent pas se contredire, mais elles peuvent
 * se tromper ensemble. Dériver la clé du nom de fichier supprime la copie ; les
 * contrôles ci-dessous suppriment l'erreur commune, et src/tests/indexNow.test.ts
 * les rejoue sans réseau.
 */
function cleIndexNow() {
  // Relatif au script, jamais au cwd : `node scripts/announce.mjs` est lancé
  // depuis la racine aujourd'hui, ce qui n'est pas une garantie.
  const dossier = fileURLToPath(new URL('../public/', import.meta.url));
  const candidats = fs.readdirSync(dossier).filter((nom) => /^[0-9a-f]{8,128}\.txt$/.test(nom));

  if (candidats.length !== 1) {
    throw new Error(
      `public/ contient ${candidats.length} fichier(s) de clé IndexNow, il en faut exactement 1 ` +
        '(nommé « <clé hexadécimale de 8 à 128 caractères>.txt »).'
    );
  }

  const cle = candidats[0].slice(0, -'.txt'.length);
  const contenu = fs.readFileSync(join(dossier, candidats[0]), 'utf8').trim();

  if (contenu !== cle) {
    throw new Error(
      `public/${candidats[0]} doit contenir exactement « ${cle} » (lu : « ${contenu} »). ` +
        'IndexNow récupère ce fichier et compare son contenu à la clé soumise.'
    );
  }

  return cle;
}

async function main() {
  const args = process.argv.slice(2);
  const prevIndex = args.indexOf('--prev');
  const currIndex = args.indexOf('--curr');
  const prevPath = prevIndex !== -1 ? args[prevIndex + 1] : null;
  const currPath = currIndex !== -1 ? args[currIndex + 1] : 'src/data/config.json';

  const siteUrl = (process.env.SITE_URL || 'https://w00-board.pages.dev').replace(/\/$/, '');
  const commitSha = process.env.GITHUB_SHA;

  console.log(`🚀 Démarrage des pings d'annonce pour ${siteUrl}`);

  // 1. Attente du déploiement live (Gate / build.json)
  if (commitSha) {
    console.log(`Attente de la mise en ligne du commit ${commitSha}...`);
    const startTime = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes
    let isLive = false;

    while (Date.now() - startTime < timeout) {
      try {
        const res = await fetch(`${siteUrl}/build.json`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.commit === commitSha) {
            console.log(`✓ Le déploiement est live (commit correspondant trouvé)`);
            isLive = true;
            break;
          } else {
            console.log(`  En cours... Live: ${data.commit} | Attendu: ${commitSha}`);
          }
        } else {
          console.log(`  build.json non disponible ou erreur HTTP ${res.status}`);
        }
      } catch (err) {
        console.log(`  Erreur de connexion lors du polling : ${err.message}`);
      }
      await sleep(15000); // Poll toutes les 15s
    }

    if (!isLive) {
      console.warn(`⚠️ Timeout d'attente du déploiement de 5 min expiré. Suite des pings quand même.`);
    }
  } else {
    console.log('Pas de GITHUB_SHA configuré, bypass de la gate de déploiement.');
  }

  // 2. Détermination des URLs modifiées
  let currConfig = null;
  try {
    currConfig = JSON.parse(fs.readFileSync(currPath, 'utf8'));
  } catch (err) {
    console.error(`Impossible de lire la config actuelle (${currPath}) :`, err.message);
    process.exit(1);
  }

  let changedBoards = [];
  if (prevPath && fs.existsSync(prevPath)) {
    try {
      const prevConfig = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
      const diff = diffBillboards(prevConfig, currConfig);
      changedBoards = [...diff.added, ...diff.changed];
    } catch (err) {
      console.warn('Erreur lors du calcul du diff pour IndexNow, utilisation de la liste vide :', err.message);
    }
  }

  let host = 'w00-board.pages.dev';
  try {
    host = new URL(siteUrl).host;
  } catch (err) {
    console.warn(`⚠️ SITE_URL invalide (${siteUrl}), utilisation du host par défaut.`, err.message);
  }

  const urlsToPing = [`${siteUrl}/`];
  for (const board of changedBoards) {
    urlsToPing.push(`${siteUrl}/b/${board.id}/`);
  }

  console.log(`URLs concernées par l'annonce :`, urlsToPing);

  // 3. WebSub Ping (pubsubhubbub)
  try {
    console.log('WebSub : Ping du hub PubSubHubbub...');
    const webSubParams = new URLSearchParams();
    webSubParams.append('hub.mode', 'publish');
    webSubParams.append('hub.url', `${siteUrl}/feed.xml`);

    const res = await fetch('https://pubsubhubbub.appspot.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: webSubParams.toString(),
    });

    if (res.ok) {
      console.log('✓ WebSub ping réussi');
    } else {
      console.warn(`⚠️ WebSub ping retourné HTTP ${res.status}`);
    }
  } catch (err) {
    console.error('❌ Échec ping WebSub :', err.message);
  }

  // 4. IndexNow Ping
  try {
    const key = cleIndexNow();
    console.log('IndexNow : Soumission des URLs...');
    
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        host: host,
        key: key,
        keyLocation: `${siteUrl}/${key}.txt`,
        urlList: urlsToPing,
      }),
    });

    if (res.ok) {
      console.log('✓ IndexNow soumission réussie');
    } else {
      const errText = await res.text();
      avertir(`IndexNow a retourné HTTP ${res.status} : ${errText}`);
    }
  } catch (err) {
    avertir(`Échec soumission IndexNow : ${err.message}`);
  }

  // 5. Wayback Machine Save
  console.log('Wayback Machine : Archivage des URLs...');
  for (const url of urlsToPing) {
    try {
      console.log(`  Archivage de ${url}...`);
      // Le rate limit d'Archive.org est strict, on utilise un fetch simple en continue-on-error
      const res = await fetch(`https://web.archive.org/save/${url}`);
      if (res.ok) {
        console.log(`  ✓ Sauvegardé dans Wayback Machine`);
      } else {
        console.warn(`  ⚠️ Wayback a retourné HTTP ${res.status}`);
      }
    } catch (err) {
      console.error(`  ❌ Échec sauvegarde Wayback Machine pour ${url} :`, err.message);
    }
    // Espacement de 5 secondes
    await sleep(5000);
  }

  console.log('✓ Pings terminés !');
}

main().catch((err) => {
  console.error('Erreur globale announce.mjs :', err);
  process.exit(1);
});

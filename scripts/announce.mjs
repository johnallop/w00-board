/**
 * Script d'annonce et de pings de découverte (IndexNow, WebSub, Wayback Machine).
 *
 * Usage :
 *   node scripts/announce.mjs [--prev prev-config.json] [--curr src/data/config.json]
 */

import fs from 'fs';
import { diffBillboards } from './lib/diff-billboards.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const key = 'e7a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5';
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
      console.warn(`⚠️ IndexNow a retourné HTTP ${res.status} : ${errText}`);
    }
  } catch (err) {
    console.error('❌ Échec soumission IndexNow :', err.message);
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

/**
 * Orchestrateur de diffusion multi-protocoles.
 *
 * Usage :
 *   - Mode Diff : node scripts/broadcast.mjs --prev prev-config.json
 *   - Mode Manuel/Heartbeat : node scripts/broadcast.mjs --id <id> [--repost]
 *   - Mode Heartbeat Auto : node scripts/broadcast.mjs --heartbeat
 */

import fs from 'fs';
import { diffBillboards } from './lib/diff-billboards.mjs';
import { heartbeatBoard } from './lib/rotation.mjs';
import { validerPanneauDiffusable, validerSiteUrl, verdictDiffusion } from './lib/diffusion.mjs';

// Import dynamique des clients pour éviter les plantages si certains modules ont des soucis
const CLIENTS = {
  mastodon: () => import('./post-mastodon.mjs'),
  bluesky: () => import('./post-bluesky.mjs'),
  nostr: () => import('./post-nostr.mjs'),
  telegram: () => import('./post-telegram.mjs'),
  discord: () => import('./post-discord.mjs'),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const args = process.argv.slice(2);
  const prevIndex = args.indexOf('--prev');
  const currIndex = args.indexOf('--curr');
  const idIndex = args.indexOf('--id');
  const isHeartbeat = args.includes('--heartbeat');
  let repost = args.includes('--repost');

  const prevPath = prevIndex !== -1 ? args[prevIndex + 1] : null;
  const currPath = currIndex !== -1 ? args[currIndex + 1] : 'src/data/config.json';
  let targetId = idIndex !== -1 ? args[idIndex + 1] : null;

  const dryRun = process.env.DRY_RUN === '1';

  let siteUrl;
  try {
    siteUrl = validerSiteUrl(process.env.SITE_URL || 'https://w00-board.pages.dev');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  if (dryRun) {
    console.log('⚡ Mode DRY_RUN activé (aucune publication réelle)');
  }

  // Chargement de la config actuelle
  let currConfig;
  try {
    currConfig = JSON.parse(fs.readFileSync(currPath, 'utf8'));
  } catch (err) {
    console.error(`Impossible de lire la config actuelle (${currPath}) :`, err.message);
    process.exit(1);
  }

  /*
   * `billboards` était consommé sans contrôle : `.find()` ligne 69 et
   * `diffBillboards` plus bas supposent tous deux un tableau. Une config dont
   * la clé manque produisait un TypeError attrapé par le `.catch()` global,
   * c'est-à-dire un message d'erreur sur la pile d'appels plutôt que sur la
   * donnée fautive.
   */
  if (!Array.isArray(currConfig?.billboards)) {
    console.error(`Config invalide (${currPath}) : "billboards" doit être un tableau.`);
    process.exit(1);
  }

  let boardsToBroadcast = [];

  if (isHeartbeat) {
    // Calcul automatique du panneau de la semaine
    const weeklyBoard = heartbeatBoard(currConfig.billboards, new Date());
    if (!weeklyBoard) {
      console.log('Le mur est vide, aucun heartbeat à envoyer.');
      process.exit(0);
    }
    targetId = weeklyBoard.id;
    repost = true; // Forcer repost pour le heartbeat
    console.log(`[Heartbeat] Panneau de la semaine identifié : ${targetId}`);
  }

  if (targetId) {
    // Mode manuel / heartbeat
    const board = currConfig.billboards.find((b) => b.id === targetId);
    if (!board) {
      console.error(`Panneau avec l'ID "${targetId}" introuvable dans la config actuelle`);
      process.exit(1);
    }
    boardsToBroadcast = [board];
  } else if (prevPath) {

    // Mode diff
    let prevConfig = null;
    try {
      if (fs.existsSync(prevPath)) {
        prevConfig = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
      } else {
        console.log(`Fichier de config précédente (${prevPath}) inexistant, diff vide.`);
      }
    } catch (err) {
      console.warn(`Impossible de lire la config précédente, diff vide :`, err.message);
    }

    const diff = diffBillboards(prevConfig, currConfig);
    boardsToBroadcast = [...diff.added, ...diff.changed];
    console.log(`Diff calculé : ${diff.added.length} ajoutés, ${diff.changed.length} modifiés.`);
  } else {
    console.log('Usage : node scripts/broadcast.mjs [--prev prev-config.json] [--id <id>] [--repost]');
    process.exit(0);
  }

  if (boardsToBroadcast.length === 0) {
    console.log('Aucun panneau à diffuser.');
    process.exit(0);
  }

  /*
   * Dernière porte avant la publication. `validateConfig` ne s'exécute qu'au
   * build ; or ce workflow ne build pas (npm ci puis node directement). Sans ce
   * contrôle, un `id` arbitraire partait tel quel dans l'URL diffusée sur cinq
   * plateformes publiques, et un `message` absent devenait « undefined ».
   *
   * On refuse en bloc plutôt que de filtrer les panneaux fautifs : diffuser
   * partiellement un lot dont on sait qu'il est malformé, c'est reproduire à
   * l'étage du dessus le défaut qu'on corrige ici.
   */
  try {
    boardsToBroadcast.forEach((b, i) => validerPanneauDiffusable(b, `panneau à diffuser [${i}]`));
  } catch (err) {
    console.error(`❌ Diffusion refusée — ${err.message}`);
    process.exit(1);
  }

  // Anti-spam
  if (boardsToBroadcast.length > 3) {
    console.warn(`⚠️ Limite anti-spam dépassée : ${boardsToBroadcast.length} panneaux à diffuser.`);
    console.warn(`Seuls les 3 premiers seront diffusés.`);
    const ignored = boardsToBroadcast.slice(3).map((b) => b.id);
    console.warn(`Panneaux ignorés (à diffuser manuellement si besoin) : ${ignored.join(', ')}`);
    boardsToBroadcast = boardsToBroadcast.slice(0, 3);
  }

  // Vrai dès qu'un panneau a un verdict non nul. On ne sort pas de la boucle
  // pour autant : les panneaux suivants doivent être tentés, l'échec est
  // rapporté à la fin plutôt qu'en interrompant la diffusion à mi-parcours.
  let echecGlobal = false;

  for (let i = 0; i < boardsToBroadcast.length; i++) {
    const board = boardsToBroadcast[i];
    
    // Espacement de 45 secondes entre les publications (sauf pour le premier ou en dry-run)
    if (i > 0 && !dryRun) {
      console.log('Attente de 45 secondes avant la prochaine diffusion...');
      await sleep(45000);
    }

    const message = repost ? `📌 ${board.message}` : board.message;
    const author = board.author;
    const tags = board.tags || [];
    const hashtags = tags.length
      ? tags.map((t) => '#' + t.replace(/\s+/g, '')).join(' ')
      : '#Billboard #W00Board';
    const url = `${siteUrl}/b/${board.id}/`;

    console.log(`\n📢 Diffusion du panneau [${board.id}] : "${message}" par ${author}`);

    // Diffusion sur chaque canal
    const resultats = [];
    for (const [name, loader] of Object.entries(CLIENTS)) {
      try {
        const hasCredentials = checkCredentials(name);

        if (!hasCredentials) {
          if (dryRun) {
            console.log(`  [${name}] (Simulé sans secrets) -> URL: ${url}`);
            resultats.push({ canal: name, etat: 'simule' });
          } else {
            console.log(`  [${name}] Non configuré (secrets manquants) — Skip`);
            resultats.push({ canal: name, etat: 'absent' });
          }
          continue;
        }

        if (dryRun) {
          console.log(`  [${name}] (Simulé) -> URL: ${url}`);
          resultats.push({ canal: name, etat: 'simule' });
        } else {
          console.log(`  [${name}] Envoi en cours...`);
          const module = await loader();
          await module.post({ message, author, hashtags, url });
          resultats.push({ canal: name, etat: 'publie' });
        }
      } catch (err) {
        console.error(`  ❌ [${name}] Échec :`, err.message);
        resultats.push({ canal: name, etat: 'echec' });
      }
    }

    /*
     * L'erreur de chaque canal reste attrapée — un Mastodon en panne ne doit
     * pas empêcher Bluesky de recevoir le message. Mais elle ne disparaît plus
     * pour autant : elle est comptée, et le verdict remonte en code de sortie.
     */
    const verdict = verdictDiffusion(resultats);
    console.log(`  → Bilan [${board.id}] : ${verdict.resume}`);
    if (verdict.code !== 0) echecGlobal = true;
  }

  if (echecGlobal) {
    console.error("\n❌ La diffusion s'est terminée en échec (voir les bilans par panneau ci-dessus).");
    process.exit(1);
  }
  console.log('\n✅ Diffusion terminée.');
}

function checkCredentials(platform) {
  const {
    MASTODON_TOKEN,
    MASTODON_INSTANCE,
    BLUESKY_HANDLE,
    BLUESKY_PASSWORD,
    NOSTR_PRIVATE_KEY,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    DISCORD_WEBHOOK_URL,
  } = process.env;

  switch (platform) {
    case 'mastodon':
      return !!(MASTODON_TOKEN && MASTODON_INSTANCE);
    case 'bluesky':
      return !!(BLUESKY_HANDLE && BLUESKY_PASSWORD);
    case 'nostr':
      return !!NOSTR_PRIVATE_KEY;
    case 'telegram':
      return !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
    case 'discord':
      return !!DISCORD_WEBHOOK_URL;
    default:
      return false;
  }
}

main().catch((err) => {
  console.error('Erreur globale de l\'orchestrateur :', err);
  process.exit(1);
});

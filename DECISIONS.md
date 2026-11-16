# Journal des décisions

Les choix structurants de W00-BOARD, avec ce qui les a motivés et la preuve qui les a départagés. Le détail vit dans le code et les PR ; ce fichier sert à retrouver **pourquoi** sans relire l'historique.

Une entrée par décision, la plus récente en haut. Une décision remplacée n'est pas effacée : elle passe au statut « remplacée » avec un renvoi.

| Champ | Contenu |
|---|---|
| Statut | en vigueur · remplacée (→ n°) · abandonnée |
| Contexte | le problème, tel qu'il a été constaté |
| Décision | ce qui a été retenu |
| Preuve | la mesure ou la source qui a tranché |
| Conséquences | ce que la décision coûte ou interdit |

---

## 8. Période de diffusion filtrée à l'affichage, hors empreinte

- **Date** : 2026-11-16 · **Statut** : en vigueur
- **Contexte** : un panneau ne pouvait pas être limité dans le temps (« du 1er au 15 décembre »).
- **Décision** : champs facultatifs `startDate` / `endDate`. La règle vit dans `scripts/lib/programmation.mjs` et s'applique là où une horloge existe : le kiosque `/live` (navigateur) et la rotation hebdomadaire du heartbeat. Les deux champs ne font pas partie de l'empreinte d'authenticité.
- **Preuve** : le build ne doit pas lire l'heure, sinon le même commit produit d'autres octets et le CID IPFS change (`src/tests/reproducibility.test.ts`). Inclure les champs dans la chaîne canonique à positions fixes changerait l'empreinte de tous les panneaux publiés.
- **Conséquences** : le mur, les flux et le sitemap listent tous les panneaux ; la diffusion sociale part à la fusion, même pour une période future ; sans JavaScript, `/live` ne trie pas.

## 7. Le heartbeat surveille le nom IPNS au lieu de le republier

- **Date** : 2026-11-16 · **Statut** : en vigueur · **PR** : #6
- **Contexte** : le heartbeat republiait chaque jour le même CID pour garder l'enregistrement IPNS valide (48 h chez Filebase).
- **Décision** : en mode `--depuis-log`, `scripts/update-ipns.mjs` ne publie plus. Il vérifie que le nom désigne le dernier CID de `CIDS.log`, que la passerelle le sert, et qu'il reste au moins 24 h de validité ; sinon il échoue.
- **Preuve** : un PUT Filebase au même CID répond 200 sans republier (séquence 1 → 1, mesuré le 2026-11-15). Filebase re-signe l'enregistrement de lui-même (échéance repoussée, séquence inchangée, mesuré le 2026-11-16).
- **Conséquences** : la durée de vie du nom dépend d'un comportement non documenté de Filebase ; le heartbeat est là pour le voir cesser.

## 6. Nom IPNS géré par Filebase plutôt que w3name

- **Date** : 2026-11-16 · **Statut** : en vigueur · **PR** : #6 (remplace la configuration w3name de #4)
- **Contexte** : le nom publié par w3name ne se résolvait pas sur le réseau.
- **Décision** : nom créé par l'API « IPNS names » de Filebase ; la clé privée reste chez Filebase. Une relecture n'est valable que si l'API, la passerelle (`X-Ipfs-Roots`) et la séquence concordent.
- **Preuve** : passerelle Filebase « could not resolve name » et routage délégué « not found », pour le nom du site comme pour un nom de test, alors que l'API de w3name relisait un état conforme (2026-11-15).
- **Conséquences** : un seul nom dans l'offre gratuite ; ne jamais le supprimer ni le recréer.

## 5. Épinglage prouvé par la passerelle quand la métadonnée manque

- **Date** : 2026-11-15 · **Statut** : en vigueur · **PR** : #4
- **Contexte** : le déploiement échouait sur « Filebase annonce le CID None » alors que le contenu était servi.
- **Décision** : attendre la métadonnée `cid` jusqu'à 3 min, sinon accepter comme preuve le `build.json` servi sous ce CID par `ipfs.filebase.io` et portant le commit déployé.
- **Preuve** : runs de c32f834 et c4fc4ed en échec, contenu pourtant joignable ; vert sur 0607e56.

## 4. Miroir IPFS sur Filebase après la fermeture de Storacha

- **Date** : 2026-11-14 · **Statut** : en vigueur · **PR** : #3
- **Contexte** : `up.storacha.network` ne résout plus (NXDOMAIN).
- **Décision** : envoi du CAR sur Filebase par l'API S3 (`--metadata import=car`), avec l'AWS CLI déjà présente sur le runner, sans paquet ajouté. Le CID annoncé doit égaler celui des octets testés.
- **Conséquences** : offre gratuite plafonnée en nombre de fichiers épinglés (voir README, « Miroir IPFS »).

## 3. Propositions de panneaux par issue GitHub

- **Date** : 2026-11-14 · **Statut** : en vigueur · **PR** : #2
- **Contexte** : permettre de proposer un panneau sans toucher au dépôt.
- **Décision** : `/creer/` fabrique une issue préremplie ; un compte ayant le droit « triage » pose le label `panneau-approuve` ; `propose.yml` ouvre une PR ; rien n'est publié avant la fusion.
- **Preuve** : écrire `config.json` depuis le navigateur exigerait une fonction serveur détenant un jeton d'écriture (`scripts/lib/proposition.mjs:6-11`).
- **Conséquences** : un compte GitHub est nécessaire pour proposer.

## 2. Service Worker en network-first

- **Date** : 2026-11-14 (documentation de la stratégie livrée) · **Statut** : en vigueur
- **Contexte** : servir le cache d'abord rendait la page plus vite, mais cassait le premier affichage après chaque déploiement.
- **Décision** : réseau d'abord, cache en repli, pour les navigations comme pour les sous-ressources.
- **Preuve** : un document et ses sous-ressources hachées forment une génération indivisible ; après un déploiement, les anciens `_astro/*` n'existent plus (README, « Mode hors-ligne »).
- **Conséquences** : un aller-retour réseau avant le premier rendu, sauf hors ligne.

## 1. Le heartbeat ne republie que ce que CIDS.log atteste

- **Date** : 2026-07-19 (origine du projet) · **Statut** : en vigueur, étendue par n° 7
- **Contexte** : le heartbeat calculait son propre CID sans le confronter à rien ; une divergence avec deploy.yml aurait fait désigner un contenu jamais épinglé.
- **Décision** : `--depuis-log` : la seule source du CID attendu est la branche `ipfs-history`, écrite par deploy.yml après un épinglage vérifié.
- **Preuve** : raisonnement documenté dans `scripts/lib/journal-verdict.mjs` et gardé par `src/tests/workflowCoupling.test.ts`.

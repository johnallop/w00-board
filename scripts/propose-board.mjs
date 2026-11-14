/**
 * Ajoute à src/data/config.json le panneau proposé dans une issue.
 *
 * Lancé par .github/workflows/propose.yml quand un mainteneur pose le label
 * d'approbation. Ce script ne publie rien : il modifie le fichier dans le
 * runner, le workflow vérifie ensuite par un build complet (validateConfig :
 * contraste WCAG, unicité de l'id) puis ouvre une pull request. La fusion de
 * cette PR — geste humain — déclenche le déploiement et la diffusion.
 *
 * Entrées (variables d'environnement, jamais d'interpolation ${{ }}) :
 *   ISSUE_BODY    corps de l'issue, donnée non fiable
 *   CONFIG_PATH   optionnel, défaut src/data/config.json
 * Sortie : `id=<id du panneau>` dans $GITHUB_OUTPUT.
 */

import fs from 'node:fs';
import { extraireProposition, ajouterPanneau, serialiserConfig } from './lib/proposition.mjs';

const cheminConfig = process.env.CONFIG_PATH || 'src/data/config.json';

try {
  const panneau = extraireProposition(process.env.ISSUE_BODY);
  const config = JSON.parse(fs.readFileSync(cheminConfig, 'utf8'));
  // Date de l'approbation, sans millisecondes : la forme des dates existantes.
  const date = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const suivante = ajouterPanneau(config, panneau, date);
  fs.writeFileSync(cheminConfig, `${serialiserConfig(suivante)}\n`);

  console.log(`✓ Panneau « ${panneau.id} » ajouté à ${cheminConfig}`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `id=${panneau.id}\n`);
  }
} catch (err) {
  // Le message part tel quel dans le commentaire d'échec sur l'issue : il doit
  // dire au proposant quoi corriger, pas montrer une pile d'appels.
  console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

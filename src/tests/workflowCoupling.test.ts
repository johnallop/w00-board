import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

/*
 * Le couplage par l'ordre.
 *
 * Une étape sans `if:` porte un `if: success()` implicite : elle ne s'exécute
 * que si TOUTES les précédentes ont réussi. Écrire deux tâches l'une après
 * l'autre dans un même job suffit donc à créer une dépendance entre elles, même
 * lorsqu'elles n'ont rien en commun. Rien dans le fichier ne signale ce lien —
 * c'est un défaut qui s'écrit tout seul, par omission.
 *
 * Le défaut d'origine, introduit ici par une correction précédente : le job
 * heartbeat lance la diffusion sociale, PUIS rafraîchit le nom IPNS. Tant que
 * broadcast.mjs sortait 0 quoi qu'il arrive, l'ordre était sans conséquence. Le
 * jour où il s'est mis à signaler ses échecs — un progrès en soi — une panne
 * Mastodon a commencé à empêcher le rafraîchissement du nom.
 *
 * Les deux tâches n'ont pas la même échéance. Une diffusion ratée se rattrape la
 * semaine suivante ; l'enregistrement w3name, lui, expire au bout d'environ un
 * an, et ce workflow hebdomadaire est tout ce qui le maintient en vie. La tâche
 * périssable ne doit pas dépendre de la tâche rattrapable.
 *
 * Ce contrôle ne relit pas la correction d'aujourd'hui : il empêche qu'une
 * étape ajoutée plus tard entre la diffusion et l'IPNS, ou une suppression
 * distraite du `if:`, ne rétablisse le couplage en silence. Aucun test
 * n'observait jusqu'ici l'ORDRE des étapes — workflowInjection.test.ts ne
 * regarde que le contenu des `run:`.
 */

const DOSSIER = path.resolve(process.cwd(), '.github/workflows');

type Etape = { name?: string; id?: string; if?: unknown; run?: unknown };
type Job = { steps?: Etape[] };

function etapesDuJob(fichier: string, job: string): Etape[] {
  const doc = parse(fs.readFileSync(path.join(DOSSIER, fichier), 'utf8')) as {
    jobs?: Record<string, Job>;
  };
  const steps = doc.jobs?.[job]?.steps;
  // Un job renommé ferait passer tout le reste à vide, sans rien signaler.
  expect(steps, `job « ${job} » introuvable dans ${fichier}`).toBeDefined();
  return steps!;
}

/** Une condition qui laisse l'étape s'exécuter après l'échec d'une précédente. */
const SURVIT_A_UN_ECHEC = /!\s*cancelled\s*\(\s*\)|always\s*\(\s*\)|failure\s*\(\s*\)/;

/**
 * Les commandes d'un `run:`, sans les commentaires qui les documentent.
 *
 * Ces blocs sont très commentés, et leurs commentaires citent les commandes dont
 * ils parlent. Un contrôle d'ORDRE mené sur le texte brut compare donc des
 * positions de prose : la première version de ce fichier a échoué ainsi, parce
 * qu'un commentaire mentionne `scripts/update-ipns.mjs` quelques lignes avant que
 * `ls-remote` ne soit exécuté. On ne retire que les lignes entièrement
 * commentées — un `#` en cours de ligne peut appartenir à une chaîne.
 */
function commandes(run: string): string {
  return run
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

describe('heartbeat.yml — le rafraîchissement IPNS ne dépend pas de la diffusion', () => {
  const etapes = etapesDuJob('heartbeat.yml', 'heartbeat');

  const iDiffusion = etapes.findIndex(
    (e) => typeof e.run === 'string' && e.run.includes('broadcast.mjs')
  );
  const iIpns = etapes.findIndex((e) => e.id === 'ipns');

  it('retrouve les deux étapes concernées', () => {
    // Sans ces deux repères, les assertions suivantes porteraient sur du vide.
    expect(iDiffusion, 'aucune étape ne lance broadcast.mjs').toBeGreaterThanOrEqual(0);
    expect(iIpns, 'aucune étape ne porte id: ipns').toBeGreaterThanOrEqual(0);
  });

  it('rafraîchit le nom même quand la diffusion a échoué', () => {
    // Placer l'IPNS avant la diffusion réglerait aussi le problème : le contrôle
    // porte sur l'absence de dépendance, pas sur une écriture particulière.
    if (iIpns < iDiffusion) return;

    const condition = etapes[iIpns]?.if;
    expect(
      typeof condition === 'string' ? condition : '',
      "L'étape IPNS suit la diffusion sans `if:` : elle hérite du `if: success()` " +
        "implicite et ne s'exécutera plus dès qu'une diffusion échoue. " +
        "L'enregistrement w3name expire en ~1 an et ce job est ce qui le maintient. " +
        'Énoncer sa vraie dépendance, par exemple ' +
        "`if: ${{ !cancelled() && steps.install.outcome == 'success' }}`."
    ).toMatch(SURVIT_A_UN_ECHEC);
  });

  it('ne se conditionne pas au résultat de la diffusion', () => {
    const condition = typeof etapes[iIpns]?.if === 'string' ? (etapes[iIpns].if as string) : '';
    const idDiffusion = etapes[iDiffusion]?.id;
    if (!idDiffusion) return; // l'étape de diffusion n'a pas d'id : rien à référencer

    // `!cancelled() && steps.diffusion.outcome == 'success'` rétablirait le
    // couplage sous une forme explicite : le contrôle précédent passerait.
    expect(
      condition.includes(`steps.${idDiffusion}.`),
      `La condition de l'étape IPNS référence l'étape de diffusion (${idDiffusion}) : ${condition}`
    ).toBe(false);
  });

  it('dépend en revanche de l’installation des dépendances', () => {
    // L'autre extrême — `if: always()` — ferait tourner l'étape après un `npm ci`
    // cassé : elle échouerait sur un import w3name introuvable, et le lecteur des
    // logs chercherait la cause au mauvais endroit.
    const condition = typeof etapes[iIpns]?.if === 'string' ? (etapes[iIpns].if as string) : '';
    const install = etapes.find((e) => typeof e.run === 'string' && /npm ci\b/.test(e.run));
    expect(install?.id, 'l’étape `npm ci` doit porter un id pour être référençable').toBeTruthy();
    expect(condition).toContain(`steps.${install!.id}.outcome`);
  });
});

/*
 * Le couplage par la déduction.
 *
 * Les contrôles ci-dessus portent sur l'ordre des étapes. Ceux qui suivent
 * portent sur autre chose : deux propriétés de workflow dont dépend un
 * RAISONNEMENT écrit ailleurs, dans scripts/lib/journal-verdict.mjs.
 *
 * Ce module a remplacé une politique arbitraire — « journal vide → on ignore » —
 * par une déduction : quand update-ipns.mjs lit CIDS.log, la branche
 * ipfs-history est prouvée exister, donc un CID y a été inscrit, donc un journal
 * vide signale une perte et non un dépôt neuf. La déduction s'appuie sur deux
 * faits qui ne vivent pas dans le module :
 *
 *   1. heartbeat.yml filtre le dépôt neuf AVANT d'appeler node, par
 *      `git ls-remote --exit-code` ;
 *   2. deploy.yml crée la branche et sa première ligne de journal dans le même
 *      push, donc atomiquement.
 *
 * Un fichier peut devenir faux sans qu'on y touche. Retirer la garde
 * ls-remote, ou pousser la branche avant d'y écrire, invaliderait la déduction à
 * distance — et rallumerait précisément le voyant rouge permanent que ce lot a
 * écarté : chaque lundi, sur un dépôt neuf, un heartbeat rouge. Les messages
 * d'échec ci-dessous nomment donc la conséquence, pas l'écart.
 */

describe('heartbeat.yml — le dépôt neuf n’atteint jamais update-ipns.mjs', () => {
  const etapes = etapesDuJob('heartbeat.yml', 'heartbeat');
  const ipns = etapes.find((e) => e.id === 'ipns');
  const run = commandes(typeof ipns?.run === 'string' ? ipns.run : '');

  it('retrouve l’étape IPNS et son script', () => {
    // Un `run:` vide ferait passer les `toContain` suivants sur une chaîne vide…
    // qui échouent bien, mais avec un message trompeur. On le dit d'abord.
    expect(run, 'aucune étape id: ipns avec un `run:` dans heartbeat.yml').not.toBe('');
    expect(run, 'l’étape IPNS n’appelle plus update-ipns.mjs').toContain('update-ipns.mjs');
  });

  it('interroge origin avant d’appeler le script', () => {
    expect(
      run,
      'La garde `git ls-remote --exit-code --heads origin ipfs-history` a disparu de ' +
        'l’étape IPNS. Elle est ce qui absorbe le cas du dépôt neuf : sans elle, un ' +
        'dépôt sans branche ipfs-history atteint update-ipns.mjs, qui lit un journal ' +
        'vide et ABANDONNE — c’est-à-dire un heartbeat rouge chaque lundi, pour un ' +
        'dépôt parfaitement sain. La déduction de scripts/lib/journal-verdict.mjs ' +
        '(« un journal vide ici veut dire une perte, pas un dépôt neuf ») repose sur ' +
        'cette garde et vient de devenir fausse.'
    ).toContain('git ls-remote --exit-code --heads origin ipfs-history');

    expect(
      run.indexOf('ls-remote') < run.indexOf('update-ipns.mjs'),
      'La garde ls-remote passe APRÈS l’appel au script : elle ne filtre plus rien.'
    ).toBe(true);
  });

  it('traite « branche absente » comme un succès sans rien publier', () => {
    // Code 2 = branche absente. C'est le seul cas bénin ; le confondre avec un
    // échec de `ls-remote` (réseau, droits) rejouerait le travers corrigé dans
    // resoudreOuNull — « je n'ai pas pu demander » lu comme « rien n'existe ».
    expect(
      run,
      'L’arme `2)` du `case` ne sort plus en 0. Une branche ipfs-history absente ' +
        'est un dépôt neuf, pas un incident : la traiter en échec allume un voyant ' +
        'rouge permanent, et le rendre vert SANS `exit 0` laisserait couler jusqu’au ' +
        'script, qui lui abandonnerait. Le contrat attendu est verified=skipped.'
    ).toMatch(/^\s*2\)[\s\S]*?exit 0\s*;;/m);

    expect(run, 'l’arme « branche absente » ne rapporte plus verified=skipped').toMatch(
      /2\)[\s\S]*?verified=skipped/
    );
  });
});

describe('deploy.yml — la branche et son journal naissent du même push', () => {
  const etapes = etapesDuJob('deploy.yml', 'ipfs');

  /*
   * On repère l'étape par `>> CIDS.log`, pas par `CIDS.log`.
   *
   * La première version cherchait la mention du fichier. Une réfutation l'a
   * prise en défaut : en ajoutant `--depuis-log history/CIDS.log` à l'étape
   * IPNS — qui précède celle-ci — elle a fait pointer le `find` sur la mauvaise
   * étape, et tout ce bloc s'est mis à mesurer l'ordre des commandes d'un
   * voisin. Le fichier est mentionné par qui en parle ; `>>` n'est écrit que
   * par qui l'écrit.
   */
  const traces = etapes.filter((e) => typeof e.run === 'string' && e.run.includes('>> CIDS.log'));
  const run = commandes(typeof traces[0]?.run === 'string' ? traces[0].run : '');

  it('retrouve une étape et une seule qui écrit le journal', () => {
    // Un localisateur ambigu ne doit pas départager en silence : les contrôles
    // d'ordre qui suivent ne valent que s'ils portent sur l'étape voulue.
    expect(
      traces.length,
      'deploy.yml n’a plus exactement une étape qui ajoute une ligne à CIDS.log. ' +
        'À zéro, la traçabilité des épinglages a disparu ; à deux, les contrôles ' +
        'd’ordre ci-dessous ne savent plus laquelle ils mesurent.'
    ).toBe(1);
  });

  it('écrit et commite le journal AVANT de publier la branche', () => {
    const iEcriture = run.indexOf('>> CIDS.log');
    const iCommit = run.indexOf('git commit');
    const iPush = run.indexOf('git push origin ipfs-history');

    expect(iEcriture, 'plus aucune ligne n’est ajoutée à CIDS.log').toBeGreaterThanOrEqual(0);
    expect(iPush, 'la branche ipfs-history n’est plus poussée').toBeGreaterThanOrEqual(0);

    const message =
      'Le journal n’est plus écrit et commité avant le `git push`. C’est ce qui ' +
      'rendait la création atomique : `git switch --orphan` ne crée qu’une ref ' +
      'locale, et le push qui la publie portait déjà le commit ajoutant CIDS.log — ' +
      'donc aucun état normal où la branche existe sans son journal. Pousser d’abord ' +
      'ouvre cette fenêtre, et pendant elle heartbeat.yml voit la branche, appelle ' +
      'update-ipns.mjs, lit un journal absent et ABANDONNE. La déduction de ' +
      'scripts/lib/journal-verdict.mjs vient de devenir fausse.';

    expect(iEcriture < iPush, message).toBe(true);
    expect(iCommit >= 0 && iCommit < iPush, message).toBe(true);
  });

  it('ne lit jamais le journal : deploy.yml publie le CID qu’il vient d’épingler', () => {
    // `--depuis-log` n'a qu'un appelant, et c'est ce qui autorise
    // journal-verdict.mjs à raisonner sur le contexte d'appel. Un second appelant
    // — sans la garde ls-remote — invaliderait la déduction en silence.
    // `commandes` aussi ici : un commentaire expliquant « deploy.yml ne passe
    // jamais --depuis-log » ferait échouer le contrôle en énonçant ce qu'il vérifie.
    const tous = etapesDuJob('deploy.yml', 'ipfs')
      .map((e) => commandes(typeof e.run === 'string' ? e.run : ''))
      .join('\n');
    expect(
      tous,
      'deploy.yml appelle update-ipns.mjs avec --depuis-log. Ce mode suppose la ' +
        'garde ls-remote de heartbeat.yml, absente ici : un second appelant rend ' +
        'caduque la déduction de scripts/lib/journal-verdict.mjs. deploy.yml doit ' +
        'passer le CID que `w3 up` vient d’épingler.'
    ).not.toContain('--depuis-log');
  });
});

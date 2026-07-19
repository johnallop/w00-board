import { describe, it, expect } from 'vitest';
import { surveillerMiseAJour } from '../utils/swUpdate';
import type { Conteneur, Enregistrement, TravailleurEntrant } from '../utils/swUpdate';

/*
 * Le sujet de ce fichier tient en une phrase : une PREMIÈRE INSTALLATION et une
 * MISE À JOUR déclenchent exactement la même séquence d'événements. Le seul
 * fait qui les distingue — y avait-il déjà un worker aux commandes ? — n'est
 * lisible qu'au moment de l'abonnement, avant que quoi que ce soit n'arrive.
 *
 * Un faux registre suffit donc à tout couvrir : la logique n'est pas asynchrone
 * et ne touche à aucune API de navigateur, elle ne fait que trier des signaux.
 */

/** Un service worker en cours d'installation, dont on pilote l'état à la main. */
function faireEntrant(): TravailleurEntrant & { passerA(etat: string): void } {
  const ecouteurs: Array<() => void> = [];
  let etat = 'installing';
  return {
    get state() {
      return etat;
    },
    addEventListener(_type, ecouteur) {
      ecouteurs.push(ecouteur);
    },
    passerA(nouvel) {
      etat = nouvel;
      for (const e of [...ecouteurs]) e();
    },
  };
}

/** navigator.serviceWorker.register(...), réduit à ce que la fonction lit. */
function faireEnregistrement(): Enregistrement & {
  installer(): ReturnType<typeof faireEntrant>;
  installerSansEntrant(): void;
} {
  const ecouteurs: Array<() => void> = [];
  let entrant: TravailleurEntrant | null = null;
  return {
    get installing() {
      return entrant;
    },
    addEventListener(_type, ecouteur) {
      ecouteurs.push(ecouteur);
    },
    installer() {
      const nouveau = faireEntrant();
      entrant = nouveau;
      for (const e of [...ecouteurs]) e();
      return nouveau;
    },
    /*
     * `registration.installing` peut valoir null au moment où updatefound part :
     * le worker a pu franchir 'installed' avant que l'écouteur ne le lise. Ce
     * n'est pas une hypothèse d'école, c'est la raison du `if (!entrant) return`.
     */
    installerSansEntrant() {
      entrant = null;
      for (const e of [...ecouteurs]) e();
    },
  };
}

/** navigator.serviceWorker. `avecControleur` est TOUT l'enjeu du module. */
function faireConteneur(avecControleur: boolean): Conteneur & { remplacerLeControleur(): void } {
  const ecouteurs: Array<() => void> = [];
  return {
    controller: avecControleur ? { scriptURL: '/sw.js' } : null,
    addEventListener(_type, ecouteur) {
      ecouteurs.push(ecouteur);
    },
    remplacerLeControleur() {
      for (const e of [...ecouteurs]) e();
    },
  };
}

/** Monte le tout et rend de quoi jouer la séquence, plus le compteur de signaux. */
function monter(avecControleur: boolean) {
  const enregistrement = faireEnregistrement();
  const conteneur = faireConteneur(avecControleur);
  let signaux = 0;
  surveillerMiseAJour(enregistrement, conteneur, () => {
    signaux += 1;
  });
  return { enregistrement, conteneur, signaux: () => signaux };
}

describe('surveillerMiseAJour', () => {
  /*
   * LE TEST QUI PORTE LE MODULE. Sans le garde `Boolean(conteneur.controller)`,
   * celui-ci échoue et tous les autres passent : la fonction ferait alors très
   * bien son travail, sur la mauvaise moitié des visiteurs.
   */
  it('ne signale rien lors de la toute première installation', () => {
    const { enregistrement, conteneur, signaux } = monter(false);

    enregistrement.installer().passerA('installed');
    conteneur.remplacerLeControleur();

    expect(
      signaux(),
      'Un visiteur qui arrive pour la première fois se voit annoncer une ' +
        '« nouvelle version » de la page qu’il vient d’ouvrir. Une première ' +
        'installation émet exactement les mêmes événements qu’une mise à jour ; ' +
        'seule la présence d’un contrôleur AVANT l’abonnement les distingue.'
    ).toBe(0);
  });

  it('signale quand une version en remplace une autre', () => {
    const { enregistrement, signaux } = monter(true);

    enregistrement.installer().passerA('installed');

    expect(
      signaux(),
      'Une nouvelle version s’est installée sous une page ouverte et rien ne ' +
        'le dit. Un onglet qui ne navigue jamais — /live sur un écran mural, ' +
        'qui n’a ni minuteur ni rechargement — reste alors figé indéfiniment.'
    ).toBe(1);
  });

  it('signale aussi sur controllerchange seul', () => {
    const { conteneur, signaux } = monter(true);

    conteneur.remplacerLeControleur();

    expect(
      signaux(),
      'clients.claim() a donné la main à un nouveau worker sans qu’updatefound ' +
        'ait été observé, et le signal est perdu. Les deux sources doivent être ' +
        'écoutées : aucune n’est garantie seule.'
    ).toBe(1);
  });

  /*
   * skipWaiting() + clients.claim() font arriver les deux signaux quasi
   * simultanément. Sans déduplication, la bannière serait montée deux fois — et
   * si un jour l'appelant choisit le rechargement automatique plutôt que la
   * bannière, deux rechargements.
   */
  it('ne signale qu’une fois quand les deux signaux arrivent', () => {
    const { enregistrement, conteneur, signaux } = monter(true);

    enregistrement.installer().passerA('installed');
    conteneur.remplacerLeControleur();

    expect(
      signaux(),
      'Les deux sources ont parlé et l’appelant a été prévenu deux fois : ' +
        'skipWaiting() + clients.claim() les font arriver ensemble, c’est le ' +
        'cas NORMAL, pas un cas limite.'
    ).toBe(1);
  });

  it('ignore les états intermédiaires du worker entrant', () => {
    const { enregistrement, signaux } = monter(true);
    const entrant = enregistrement.installer();

    entrant.passerA('installing');
    entrant.passerA('redundant');

    expect(
      signaux(),
      'Un worker qui n’a pas atteint « installed » a déclenché le signal. Un ' +
        'passage à « redundant » est une installation ÉCHOUÉE : annoncer une ' +
        'nouvelle version dans ce cas invite à recharger vers rien.'
    ).toBe(0);
  });

  it('survit à un updatefound sans installing', () => {
    const { enregistrement, signaux } = monter(true);

    expect(
      () => enregistrement.installerSansEntrant(),
      'updatefound est parti alors que registration.installing valait déjà ' +
        'null — le worker a franchi « installed » avant qu’on ne le lise — et ' +
        'l’écouteur a levé. Une exception ici emporte le reste du script de ' +
        'la page.'
    ).not.toThrow();

    expect(signaux()).toBe(0);
  });
});

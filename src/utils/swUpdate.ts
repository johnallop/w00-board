/**
 * Savoir qu'une nouvelle version a pris la main sous une page déjà ouverte.
 *
 * LE PROBLÈME. Le service worker appelle `skipWaiting()` puis `clients.claim()`
 * : la version fraîchement installée remplace l'ancienne immédiatement, sans
 * attendre que les onglets se ferment. C'est délibéré — un visiteur ne doit pas
 * traîner une version périmée pendant des jours. Mais personne n'écoutait ce
 * remplacement. Une page restée ouverte gardait un DOM issu de la génération
 * précédente pendant que le worker, lui, en servait une autre, et rien ne le
 * lui disait.
 *
 * Le lot 8 a refermé le cas courant côté worker : les navigations sont
 * désormais network-first, donc n'importe quel clic ramène une page cohérente.
 * Reste l'onglet qui ne navigue jamais — /live sur un écran mural, typiquement,
 * qui n'a ni minuteur ni rechargement et resterait donc figé indéfiniment.
 * C'est ce cas-là que ce module couvre.
 *
 * POURQUOI CE N'EST PAS ÉCRIT DANS Layout.astro. Un script inline dans un
 * gabarit Astro n'est atteignable par aucun test : il n'est ni importable ni
 * exécutable hors d'un navigateur. La logique — qui tient entièrement dans la
 * distinction entre « première installation » et « remplacement », et c'est
 * exactement là qu'on se trompe — vit donc ici, où swUpdate.test.ts peut la
 * confronter à de faux registres. Layout.astro ne garde que l'affichage.
 *
 * Les types sont locaux et minimaux plutôt qu'empruntés au DOM : ils décrivent
 * ce que la fonction utilise réellement, ce qui la rend testable sans simuler
 * un ServiceWorkerRegistration entier.
 */

export type TravailleurEntrant = {
  readonly state: string;
  addEventListener(type: 'statechange', ecouteur: () => void): void;
};

export type Enregistrement = {
  readonly installing: TravailleurEntrant | null;
  addEventListener(type: 'updatefound', ecouteur: () => void): void;
};

export type Conteneur = {
  readonly controller: unknown;
  addEventListener(type: 'controllerchange', ecouteur: () => void): void;
};

/**
 * Appelle `auSignal` au plus une fois, quand une version REMPLACE celle qui
 * contrôlait la page.
 *
 * @param enregistrement le retour de navigator.serviceWorker.register()
 * @param conteneur navigator.serviceWorker
 * @param auSignal ce qu'on fait du signal — laissé à l'appelant, parce que
 *   « prévenir » et « recharger » sont deux politiques différentes et que ce
 *   module n'a pas à trancher entre les deux.
 */
export function surveillerMiseAJour(
  enregistrement: Enregistrement,
  conteneur: Conteneur,
  auSignal: () => void
): void {
  /*
   * LE GARDE QUI PORTE TOUT. Une première installation déclenche EXACTEMENT les
   * mêmes événements qu'une mise à jour : updatefound, statechange vers
   * 'installed', puis controllerchange à cause de clients.claim(). Sans ce
   * test, un visiteur qui arrive pour la première fois se verrait annoncer une
   * « nouvelle version » de la page qu'il vient d'ouvrir.
   *
   * La distinction ne peut se lire qu'à cet instant : une fois le nouveau
   * worker aux commandes, `controller` est renseigné dans les deux cas et
   * l'information est perdue. On la capture donc à l'abonnement.
   */
  const avaitUnControleur = Boolean(conteneur.controller);

  let dejaSignale = false;
  const signaler = (): void => {
    if (dejaSignale || !avaitUnControleur) return;
    dejaSignale = true;
    auSignal();
  };

  /*
   * Deux sources pour un même fait, et le drapeau ci-dessus les réconcilie.
   *
   * `controllerchange` seul suffirait tant que le worker appelle skipWaiting().
   * Mais cette politique est une décision du worker, pas une garantie : le jour
   * où on la retirerait — pour ne plus remplacer une version sous les pieds
   * d'un visiteur, ce qui est un choix défendable — controllerchange ne
   * partirait plus qu'à la fermeture du dernier onglet, et le signal
   * disparaîtrait sans que rien ne le signale. `updatefound` + 'installed'
   * survit à ce changement. On écoute donc les deux, et le premier arrivé parle.
   */
  enregistrement.addEventListener('updatefound', () => {
    const entrant = enregistrement.installing;
    if (!entrant) return;
    entrant.addEventListener('statechange', () => {
      if (entrant.state === 'installed') signaler();
    });
  });

  conteneur.addEventListener('controllerchange', signaler);
}

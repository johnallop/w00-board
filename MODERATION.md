# Charte de modération

Cette charte s'applique aux panneaux proposés depuis `/creer/` (issues GitHub) et à toute modification de `src/data/config.json`. Elle dit ce qui est refusé, comment la décision est prise et tracée, et ce qu'un retrait peut ou ne peut pas effacer.

Elle n'est pas un avis juridique. Les obligations d'un hébergeur de contenus de tiers (LCEN en France, règlement européen sur les services numériques) ne sont pas vérifiées ici : `À vérifier` avant d'ouvrir largement les propositions.

## Ce que vérifie la machine, ce que juge un humain

Avant toute relecture, la page `/creer/` et le build appliquent les mêmes règles techniques : longueur (message ≤ 280 caractères, signature ≤ 60, 5 tags au plus), contraste WCAG de la couleur, identifiant unique. Une proposition qui les enfreint ne peut pas être fusionnée.

Le fond, lui, relève d'un mainteneur. Il refuse une proposition pour l'un des motifs ci-dessous, et pour aucun autre : une opinion, une croyance ou un goût différents du sien ne sont pas des motifs.

## Motifs de refus

Chaque refus porte le label `panneau-refuse` et **un** label de motif :

| Label | Motif |
|---|---|
| `refus-haine-violence` | Incitation à la haine, à la discrimination ou à la violence ; harcèlement d'une personne ou d'un groupe. |
| `refus-illegal` | Autre contenu manifestement illicite : diffamation, menace, contrefaçon, apologie d'un crime. |
| `refus-donnees-personnelles` | Donnée personnelle d'un tiers (nom complet, adresse, téléphone, e-mail, photo), ou de l'auteur au-delà de sa signature. |
| `refus-publicite-spam` | Promotion commerciale, lien d'affiliation, sollicitation, message répété. |
| `refus-usurpation` | Signature d'une personne ou d'une organisation réelle sans preuve qu'elle en est l'auteur ; urgence artificielle ou information manifestement fausse présentée comme vraie. |

## Procédure

1. **Proposition** : la page `/creer/` ouvre une issue préremplie. Si le proposant n'a pas le droit de poser le label `proposition-panneau`, GitHub l'ignore ; le mainteneur le pose.
2. **Relecture** : un compte ayant au moins le rôle « triage ». Aucun délai n'est garanti.
3. **Décision** :
   - accepter : poser `panneau-approuve`. Le workflow `propose.yml` ouvre une pull request ; la **fusion** publie ;
   - refuser : poser `panneau-refuse` et le label de motif, expliquer le motif en une phrase dans un commentaire, puis fermer l'issue comme « not planned ».
4. **Contestation** : le proposant répond dans l'issue fermée. Si le projet compte plusieurs mainteneurs, un autre que l'auteur du refus relit.

Les décisions sont tracées par GitHub lui-même : labels, commentaires et fusions sont publics et horodatés. Le [registre de conformité](REGISTRE-MODERATION.md) explique comment les extraire, et consigne ce que GitHub ne trace pas : retraits et publications hors circuit.

## Signaler un panneau publié

Ouvrir une issue qui cite **seulement l'identifiant** du panneau (`/b/<id>/`) et le motif de la liste ci-dessus, sans recopier le contenu en cause : une issue est publique, elle ne doit pas rediffuser une donnée personnelle ou un propos illicite.

## Retirer un panneau : ce qui s'efface et ce qui reste

Un panneau publié est copié à plusieurs endroits par conception (miroir IPFS, archives, diffusion sociale). Le retrait efface la source et ce que le projet contrôle ; il **ne peut pas** effacer toutes les copies.

| Où | Retrait possible | Ce qui reste |
|---|---|---|
| Site (Cloudflare Pages) | Oui : retirer le panneau de `config.json` et fusionner. Il quitte le mur, sa page, les flux et le sitemap au déploiement suivant. | Les déploiements précédents gardent leur URL propre tant qu'ils ne sont pas supprimés dans le tableau de bord Cloudflare (`À vérifier` sur le compte). |
| Historique Git | Non, sauf réécriture de l'historique. | Les versions passées de `config.json`, et tous les clones et forks existants. |
| IPFS (Filebase) | Partiel : supprimer du bucket les CAR qui le contiennent les désépingle chez Filebase. | Tout nœud IPFS qui a déjà récupéré ces CID ; la liste publique des CID dans la branche `ipfs-history`. |
| Wayback Machine | Sur demande à l'Internet Archive, procédure `À vérifier`. | Les captures déjà faites, jusqu'à leur retrait éventuel. |
| Réseaux sociaux | Oui, publication par publication, avec le compte du bot. | Sur Nostr, la suppression est une demande (NIP-09) que les relais peuvent ignorer ; partout, les copies et captures déjà faites. |
| Flux RSS et JSON | Oui, au déploiement suivant. | Les copies déjà téléchargées par les lecteurs de flux. |

Chaque retrait s'inscrit dans le registre, avec ce qui a été fait à chaque endroit.

## Licence des contributions

En proposant un panneau, son auteur accepte qu'il soit publié sous licence [Creative Commons Attribution 4.0](LICENSES/CC-BY-4.0.txt), avec sa signature comme attribution. Le code du dépôt est sous [licence MIT](LICENSE).

# Charte de modération

Cette charte s'applique aux panneaux proposés depuis `/creer/` (issues GitHub) et à toute modification de `src/data/config.json`. Elle dit ce qui est refusé, comment la décision est prise et tracée, et ce qu'un retrait peut ou ne peut pas effacer.

## Cadre juridique

Cette section résume des textes lus à la source.

- **Éditeur des panneaux publiés.** Un panneau n'est publié qu'après l'approbation d'un mainteneur. Or le règlement européen sur les services numériques ([DSA, règlement (UE) 2022/2065](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32022R2065)) retire la protection de l'hébergeur quand l'auteur d'un contenu « agit sous l'autorité ou le contrôle du fournisseur » (article 6, paragraphe 2), ou quand le fournisseur « joue un rôle actif de nature à lui permettre de connaître ou de contrôler ces informations » (considérant 18). W00-BOARD répond donc des panneaux publiés comme de son propre contenu : c'est la raison d'être de la relecture préalable.
- **Propositions en attente.** Ce sont des issues hébergées par GitHub, sous ses propres conditions d'utilisation et ses propres outils de signalement.
- **Signalement.** L'article 16 du DSA vise les hébergeurs ; son mécanisme de notification sert néanmoins de modèle à la procédure de signalement ci-dessous.

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
4. **Contestation** : le proposant répond dans l'issue fermée, ou écrit à `contact@wooddyviat.com`. Si le projet compte plusieurs mainteneurs, un autre que l'auteur du refus relit.

Les décisions sont tracées par GitHub lui-même : labels, commentaires et fusions sont publics et horodatés. Le [registre de conformité](REGISTRE-MODERATION.md) explique comment les extraire, et consigne ce que GitHub ne trace pas : retraits et publications hors circuit.

## Signaler un panneau publié

Deux voies :

- **par e-mail, à `contact@wooddyviat.com`** — à préférer pour une donnée personnelle ou un contenu illicite : le signalement reste privé ;
- **par une issue publique** — en citant **seulement l'identifiant** du panneau (`/b/<id>/`) et le motif, sans recopier le contenu en cause : une issue ne doit pas rediffuser ce qu'elle signale.

Un signalement complet contient, sur le modèle de l'article 16, paragraphe 2, du DSA :

1. l'adresse exacte du panneau (`https://board.wooddyviat.com/b/<id>/`) ;
2. le motif, choisi dans la liste ci-dessus, et pourquoi il s'applique ;
3. un nom et une adresse e-mail pour la réponse ;
4. une phrase confirmant que le signalement est fait de bonne foi et que ses informations sont exactes.

W00-BOARD accuse réception, puis fait connaître sa décision et la façon de la contester. Aucun délai n'est garanti ; un contenu manifestement illicite est traité en priorité. Le registre ne conserve ni le contenu signalé ni l'identité de la personne qui signale.

## Retirer un panneau : ce qui s'efface et ce qui reste

Un panneau publié est copié à plusieurs endroits par conception (miroir IPFS, archives, diffusion sociale). Le retrait efface la source et ce que le projet contrôle ; il **ne peut pas** effacer toutes les copies.

| Où | Retrait possible | Ce qui reste |
|---|---|---|
| Site (Cloudflare Pages) | Oui : retirer le panneau de `config.json` et fusionner. Il quitte le mur, sa page, les flux et le sitemap au déploiement suivant. Les déploiements précédents se suppriment un par un : `npx wrangler pages deployment delete <id-du-déploiement> --project-name w00-board` ([doc Cloudflare](https://developers.cloudflare.com/pages/configuration/preview-deployments/)). | Chaque déploiement précédent reste public à son adresse propre (`<hash>.w00-board.pages.dev`), même après suppression de sa branche — mesuré le 2026-11-16 : l'aperçu de la PR #8 servait encore son commit. Le dernier déploiement d'une branche ne peut pas être supprimé. |
| Historique Git | Non, sauf réécriture de l'historique. | Les versions passées de `config.json`, et tous les clones et forks existants. |
| IPFS (Filebase) | Partiel : supprimer du bucket les CAR qui le contiennent les désépingle chez Filebase. | Tout nœud IPFS qui a déjà récupéré ces CID ; la liste publique des CID dans la branche `ipfs-history`. |
| Wayback Machine | Sur demande, par e-mail à `info@archive.org`, en donnant les URL, la période à exclure et la période pendant laquelle on contrôlait le site ([aide de l'Internet Archive](https://help.archive.org/help/how-do-i-request-to-remove-something-from-archive-org/)). La demande est examinée, sans garantie : « We do not make any guarantees beforehand about the outcome of a request ». | Les captures déjà faites, jusqu'à leur retrait éventuel. |
| Réseaux sociaux | Oui, publication par publication, avec le compte du bot. | Sur Nostr, la suppression est une demande (NIP-09) que les relais peuvent ignorer ; partout, les copies et captures déjà faites. |
| Flux RSS et JSON | Oui, au déploiement suivant. | Les copies déjà téléchargées par les lecteurs de flux. |

Chaque retrait s'inscrit dans le registre, avec ce qui a été fait à chaque endroit.

## Licence des contributions

En proposant un panneau, son auteur accepte qu'il soit publié sous licence [Creative Commons Attribution 4.0](LICENSES/CC-BY-4.0.txt), avec sa signature comme attribution. Le code du dépôt est sous [licence MIT](LICENSE).

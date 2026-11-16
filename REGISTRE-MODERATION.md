# Registre de conformité

Ce registre complète la [charte de modération](MODERATION.md). Il ne recopie pas ce que GitHub trace déjà de façon publique et horodatée ; il consigne le reste. Il ne contient aucune donnée personnelle : on y cite des numéros d'issue et des identifiants de panneau, jamais le contenu refusé ni l'identité d'un signalant.

## Décisions sur les propositions (tracées par GitHub)

Propositions refusées, avec leur motif :

```bash
gh issue list --label panneau-refuse --state all --json number,title,labels,closedAt
```

Propositions publiées (pull requests ouvertes par `propose.yml`, branche `proposition/<issue>-<id>`, puis fusionnées) :

```bash
gh pr list --state merged --search "head:proposition/" --json number,title,mergedAt
```

## Publications hors circuit

Panneaux publiés directement par le propriétaire du dépôt, sans issue de proposition.

| Date | Panneau | Commit | Note |
|---|---|---|---|
| 2026-06-23 | `jesus-aime` | `97e9a48` | Antérieur au circuit de proposition. |
| 2026-06-23 | `paix` | `97e9a48` | Antérieur au circuit de proposition. |

## Retraits

Un retrait par ligne. « Fait » et « Reste » reprennent les lignes du tableau de la charte (site, Git, IPFS, Wayback, réseaux, flux).

| Date | Panneau | Motif (label) | Demande | Fait | Reste |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

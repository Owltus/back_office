# Étape 2 — Retrait de l'impayé du métier

## Objectif

Supprimer l'indicateur agrégé d'impayés de la couche métier du parking, en
laissant `captageIndex` intact à ce stade : il a encore trois appelants, qui
sont nettoyés aux étapes 3, 4 et 5. La fonction elle-même disparaît à
l'étape 5, quand plus personne ne l'appelle.

## Contexte

Les deux notions à retirer n'ont pas la même empreinte dans le métier, et c'est
toute la difficulté de cette étape.

L'**impayé** est un compteur agrégé pur. Il naît dans la vue SQL
(`count(*) filter (where r.status = 'checkout')`), transite par
`ParkingArrivalsRow.unpaid` (`service.ts:31`), est sommé dans
`aggregateParkingMonthly` (`analytics.ts:157`) et exposé par
`ParkingMonthStats.unpaid` (`analytics.ts:95-97`). Ses seuls lecteurs sont les
deux boards analytique. Il peut disparaître du métier sans rien casser
ailleurs.

Le **captage** n'a pas cette propriété. `captageIndex` (`analytics.ts:57-69`)
est importé par `src/components/repjour/DayCrossSummary.tsx:22`, qui affiche
une tuile « Captage » parking sous le rapport journalier — une page hors
périmètre. Supprimer la fonction casserait la compilation de RepJour. Le plan
retient donc l'option A de l'angle D1 : **la fonction, ses champs porteurs
(`ParkingMonthStats.clientNights`, `ParkingDayStats.occupiedClient`) et
l'import de `TOTAL_ROOMS` restent en place à cette étape.** L'utilisateur a
tranché l'angle D1 en faveur de l'option B — le captage part partout, RepJour
compris — mais supprimer la fonction ici casserait la compilation de trois
fichiers d'un coup. Sa suppression est le dernier geste de l'étape 5, une fois
ses trois appelants nettoyés aux étapes 3, 4 et 5.

Attention au piège de vocabulaire : le statut `checkout` du planning s'affiche
« Non payé » et reste pleinement en service (couleur de barre, motif
obligatoire, périmètre du CA). Ce chantier ne retire pas la notion d'impayé de
l'application — il retire l'**indicateur analytique** qui la comptait.

Dernier point d'attention : le périmètre du chiffre d'affaires
(`analytics.ts:20-25`, `service.ts:38`) inclut les réservations `checkout`.
Retirer l'indicateur d'impayés **ne doit pas** modifier ce périmètre, sous
peine de faire bouger le CA affiché. Les commentaires peuvent être reformulés
sans le mot « impayé » ; la logique reste identique.

## Fichier(s) impacté(s)

- `src/lib/parking/analytics.ts` (modifié : champ `unpaid` de `ParkingMonthStats`, accumulation)
- `src/lib/parking/service.ts` (modifié : commentaires uniquement, types inchangés)

## Travail à réaliser

### 1. Retirer le champ agrégé

Dans `analytics.ts` :

- `95-97` — supprimer la déclaration `unpaid: number` de `ParkingMonthStats`
  et sa ligne de documentation.
- `119` — supprimer l'initialisation `unpaid: 0` dans `emptyMonth`.
- `157` — supprimer l'accumulation `s.unpaid += r.unpaid`.

Ne pas toucher à `paid` ni `reserved` : ils sont déjà sans consommateur mais
sortent du périmètre (voir « Différé » de l'index).

### 2. Conserver le type de ligne SQL

`ParkingArrivalsRow.unpaid` (`service.ts:31`) reste déclaré. C'est le miroir
fidèle de la vue `parking_arrivals_agg`, qui continue de renvoyer la colonne
via `select('*')` (angle D4, option A). Documenter le champ comme non
exploité :

```ts
// Réservations parties au statut checkout. Renvoyé par la vue, plus lu par
// l'application depuis le retrait de l'indicateur d'impayés.
unpaid: number
```

Même traitement pour `client_nights` (`service.ts:27-28`) et `occupied_client`
(`service.ts:53-54`) : ils restent alimentés et servent encore le captage de
RepJour — ne rien y changer sinon le commentaire s'il mentionne les analytiques
parking.

### 3. Reformuler les commentaires qui parlent d'impayés

- `service.ts:149` — la description de `fetchParkingArrivals` mentionne
  « et l'impayé mensuel ». Retirer la mention.
- `analytics.ts:20-25` — le commentaire du périmètre de CA cite les trois
  statuts `reserve`/`paye`/`checkout`. **Conserver la logique**, reformuler
  seulement si le mot « impayé » y figure.

### 4. Ne pas toucher au captage à cette étape

Contrôle explicite en fin d'étape : `captageIndex`, le bloc de documentation
`analytics.ts:34-55`, l'import de `TOTAL_ROOMS` (`analytics.ts:6`),
`ParkingMonthStats.clientNights` et `ParkingDayStats.occupiedClient` doivent
tous être encore là. Ils partent à l'étape 5, pas avant : la règle est qu'une
fonction se supprime quand elle n'a plus d'appelant, jamais l'inverse.

## Ordre d'exécution

1. Retirer les trois occurrences de `unpaid` dans `analytics.ts`.
2. Documenter les champs non exploités dans `service.ts`.
3. Reformuler les commentaires mentionnant l'impayé.
4. `npx tsc --noEmit` — les deux boards vont remonter des erreurs sur
   `m.unpaid` et `summary.unpaid` : c'est attendu, elles sont traitées aux
   étapes 3 et 4. Vérifier que **seuls** ces deux fichiers sont en erreur.
5. Commit.

## Critère de validation

- `grep -rn "unpaid" src/lib/` ne renvoie plus que la déclaration documentée
  dans `service.ts` et les fixtures de test (traitées à l'étape 6).
- `grep -rn "captageIndex" src/` renvoie toujours sa définition dans
  `analytics.ts`, son usage dans `DayCrossSummary.tsx`, et les deux boards
  parking (encore, à ce stade).
- `npx tsc --noEmit` ne remonte d'erreurs que dans
  `ParkingAnalytiqueBoard.tsx` et `ParkingAnalytiqueMoisBoard.tsx`.
- `git diff --name-only` ne contient aucun fichier de `src/components/repjour/`.

## Contrôle qualité (revue)

Étape critique : elle modifie un module métier partagé entre deux
fonctionnalités (parking et RepJour). `/borg` n'étant pas installé, revue
manuelle. (1) Vérifier que `captageIndex` et sa signature sont inchangés, et
que `DayCrossSummary.tsx` compile sans modification. (2) Vérifier que le
périmètre du CA (`reserve`/`paye`/`checkout`) n'a pas bougé d'une ligne : le
total du CA parking doit être identique avant et après, sur un même mois.
(3) Vérifier qu'aucun champ n'a été retiré de `ParkingArrivalsRow` ni de
`ParkingDailyOccRow` — ces types décrivent la forme réelle de la vue, les
amputer masquerait des colonnes réellement renvoyées. (4) Vérifier
qu'aucune clé TanStack Query n'a été renommée à cette étape.

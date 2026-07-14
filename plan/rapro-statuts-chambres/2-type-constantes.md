# Étape 2 — Type union + constantes + garde d'exhaustivité

## Objectif

Étendre le type `RoomStatus` aux deux nouveaux statuts, remplacer le cycle de
clic par un helper de bascule binaire, et mettre à jour toutes les tables
d'affichage (libellés, couleurs, légende) — en ajoutant une garde d'exhaustivité
TypeScript pour transformer les futurs oublis en erreurs de compilation.

## Contexte

Le type vit dans `src/lib/rapro/types.ts` (ligne 3) :

```ts
export type RoomStatus = 'nettoyee' | 'non_nettoyee' | 'refus' | 'noshow'
```

La logique de statut est concentrée dans `src/lib/rapro/constants.ts` :
`STATUS_CYCLE` (l.5) et `nextStatus` (l.17-19) pour le cycle ; `statusOf` (l.27)
pour le défaut ; `STATUS_LABEL` (l.8), `cellState` (l.43-48), `CELL_STATES`
(l.53-62), `LEGEND_ORDER` (l.65-71) et `countStats` (l.75-92) pour l'affichage.
Le libellé actuel de `non_nettoyee` est « Bloquée » — la collision avec le
nouveau `bloque` est arbitrée par la décision **D1**.

Point de vigilance : `STATUS_LABEL` est un `Record<RoomStatus, …>` (protégé par
le compilateur), mais `CELL_STATES`/`CELL_FILL`/légende sont indexés par
`CellState`, sans garde d'exhaustivité sur `RoomStatus` → risque d'oubli
silencieux. Cette étape ajoute cette garde.

## Fichier(s) impacté(s)

- `src/lib/rapro/types.ts` (modifié)
- `src/lib/rapro/constants.ts` (modifié)

## Travail à réaliser

### 1. Étendre le type

```ts
export type RoomStatus =
  | 'nettoyee'
  | 'non_nettoyee'
  | 'refus'
  | 'noshow'
  | 'bloque'
  | 'faux_noshow'
```

Cet ajout fait immédiatement remonter des erreurs de compilation partout où un
`Record<RoomStatus, …>` est utilisé (ex. `STATUS_LABEL`) : c'est le comportement
recherché, chaque erreur signale un point à traiter.

### 2. Remplacer le cycle par une bascule (clic gauche)

`STATUS_CYCLE`/`nextStatus` deviennent morts pour le clic gauche. Les retirer
(après vérification qu'ils ne sont pas réutilisés ailleurs) et exposer un helper
de bascule binaire :

```ts
// Clic gauche : le geste courant. Bascule entre nettoyée et refus, sans jamais
// passer par les statuts d'exception (réservés au menu contextuel).
export function toggleClean(status: RoomStatus): RoomStatus {
  return status === 'refus' ? 'nettoyee' : 'refus'
}
```

### 3. Défaut d'une chambre vendue

Selon **D2**, `statusOf` (l.27) renvoie `nettoyee` comme défaut affiché pour une
chambre vendue (Option B recommandée : le marqueur d'absence technique reste
`non_nettoyee`, mais le défaut PRÉSENTÉ est `nettoyee`). Documenter clairement la
distinction entre « défaut affiché » et « marqueur d'absence » dans un commentaire.

### 4. Libellés, couleurs, légende, garde d'exhaustivité

- `STATUS_LABEL` : ajouter `bloque` (libellé « Bloquée » migré depuis
  `non_nettoyee` selon D1) et `faux_noshow` (« Faux no-show »).
- Étendre `CellState` et `cellState` pour mapper `bloque` et `faux_noshow` vers
  de nouveaux états visuels, puis compléter `CELL_STATES` et `LEGEND_ORDER`.
- Ajouter une garde d'exhaustivité : par exemple un objet
  `satisfies Record<RoomStatus, CellState>` pour le mapping statut → état, afin
  qu'un futur ajout de statut sans mapping soit une erreur de compilation.
- `countStats` : ajouter les décomptes des nouveaux statuts (selon leur
  classement D3/D4).

### 5. `JUSTIFIED_STATUSES` — préparation

Ne pas trancher ici le contenu final (voir étape 3, décisions D3/D4), mais
préparer la constante pour accueillir `bloque`/`faux_noshow`. Le classement
effectif et sa répercussion sur `reconcile`/`carryover` sont traités à l'étape 3.

## Ordre d'exécution

1. Acter D1 (libellé « Bloquée ») et D3/D4 (au moins provisoirement, pour les
   libellés et couleurs).
2. Étendre `RoomStatus` (types.ts).
3. Suivre les erreurs de compilation pour couvrir chaque `Record<RoomStatus, …>`.
4. Remplacer `STATUS_CYCLE`/`nextStatus` par `toggleClean`.
5. Ajouter la garde d'exhaustivité sur le mapping `cellState`.
6. `npx tsc --noEmit`.

## Critère de validation

- `RoomStatus` comprend les 6 valeurs ; tous les `Record<RoomStatus, …>` sont
  exhaustifs.
- Un statut ajouté sans mapping `cellState` provoque une erreur de compilation
  (garde d'exhaustivité active).
- `toggleClean('nettoyee') === 'refus'` et `toggleClean('refus') === 'nettoyee'`.
- `npx tsc --noEmit` vert.

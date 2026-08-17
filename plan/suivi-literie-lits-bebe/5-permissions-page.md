# Étape 5 — Permissions de la page `literie`

## Objectif

Déclarer la nouvelle page dans le système de permissions (registre TS +
RLS Supabase) et poser sa fenêtre de grâce. À l'issue, la page `literie`
existe dans le système de rôles au même titre que les 8 pages existantes, et
les policies RLS des 5 tables créées aux étapes 1-4 sont posées.

## Fichier(s) impacté(s)

- `src/lib/permissions/pages.ts` (modifié) — ajout `PageKey` + entrée `PAGES`
- `src/lib/permissions/actions.ts` (modifié) — ajout `LITERIE_GRACE_DAYS`
- `supabase/literie_rls.sql` (nouveau) — policies lecture + écriture des 6
  tables, en fichier DÉDIÉ plutôt qu'en ajout à `page_permissions_rls*.sql` :
  les 6 tables sont toutes neuves (aucune ancienne policy permissive à
  fermer), même principe que `parking_rls_fenetre_7j.sql` /
  `rapro_rls_fenetre_2j.sql`. Écart assumé par rapport à l'esquisse initiale
  de ce fichier d'étape.

## Travail à réaliser

### 1. Registre TS

```ts
// pages.ts
export type PageKey =
  | 'repjour' | 'pdj' | 'parking' | 'rapro' | 'caisse'
  | 'affichage' | 'facturation' | 'artefact'
  | 'literie'

export const PAGES: PageDef[] = [
  ...,
  { key: 'literie', label: 'Literie', route: '/literie', icon: BedDouble },
]
```

### 2. Fenêtre de grâce

```ts
// actions.ts
export const LITERIE_GRACE_DAYS = 2   // miroir RLS des étapes 8 et 9
```

### 3. Policies RLS — lecture (`literie_rls.sql`)

Une section par table, pattern standard (`page_level_rank(get_page_level(
'literie')) >= 1`) sur `hotel_rooms`, `literie_stock`,
`literie_stock_movements`, `literie_sheets`, `baby_cots`,
`baby_cot_assignments`.

### 4. Policies RLS — écriture (`literie_rls.sql`)

- `hotel_rooms` : INSERT/UPDATE `>= 2` (écriture), pas de fenêtre temporelle
  (état permanent, corrigeable à tout moment).
- `literie_sheets` : INSERT/UPDATE `gestion` OU (`>= 2` ET `report_date >=
  current_date - LITERIE_GRACE_DAYS`), même construction que
  `rapro_rls_fenetre_2j.sql`.
- `baby_cot_assignments` : INSERT/UPDATE `gestion` OU (`>= 2` ET une des deux
  bornes de la période dans la fenêtre de grâce — reprendre la clause exacte
  de `parking_rls_fenetre_7j.sql` en remplaçant `PARKING_GRACE_DAYS` par
  `LITERIE_GRACE_DAYS`).
- `baby_cots` : INSERT/UPDATE réservés à `gestion` (activer/désactiver un lit
  est une opération de gestion du parc, pas une saisie courante).
- `literie_stock`/`literie_stock_movements` : pas de policy INSERT/UPDATE
  directe (RPC only, cf. étape 2).

## Ordre d'exécution

1. Modifier `pages.ts`/`actions.ts` côté app.
2. L'utilisateur exécute `literie_rls.sql` (après les étapes 1-4, dont il
   dépend pour que les tables existent).
3. Attribuer manuellement un niveau `literie` à au moins un compte de test
   via `set_page_permission` (ou l'écran `/comptes`).

## Critère de validation

- `npx tsc --noEmit` sans erreur (nouveau `PageKey` propagé partout où le
  type union est utilisé de façon exhaustive).
- Un compte sans permission sur `literie` lit 0 ligne des 6 tables (cohérent
  avec le principe déjà vérifié pour les autres pages, cf.
  `supabase/verif_securite.sql`).
- Un compte au niveau `ecriture` peut modifier `hotel_rooms` à tout moment,
  mais `literie_sheets`/`baby_cot_assignments` seulement dans la fenêtre de
  `LITERIE_GRACE_DAYS`.

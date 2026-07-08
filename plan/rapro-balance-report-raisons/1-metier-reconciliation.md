# Étape 1 — Métier : modèle de réconciliation et prédicat de balance

## Objectif

Introduire, en **métier pur** (`src/lib/rapro/`, sans React ni Supabase), le
vocabulaire comptable de la réconciliation, avec les **trois familles** de statuts
(sur les 4 statuts existants, sans en ajouter) : **Fait** (`nettoyee`), **Hors
charge** (pas de ménage dû : `refus` / `noshow` → sort du dû, ne roule pas) et
**Dû non fait** (`non_nettoyee`, la « Bloquée » = utilisée mais non nettoyée →
dans la balance, roule). Pour un jour : calculer `due` (occupées), `clean`,
`settled` (hors charge), `pending` (= balance, dû non fait) et un prédicat
`isReconciled()` (balance à zéro), calqué sur `isBalanced()` de la caisse. Rien
n'est stocké : tout se dérive de l'occupation PDJ et des statuts rapro.

## Contexte

Aujourd'hui `countStats(statuses, occupied)` (`src/lib/rapro/constants.ts:69-86`)
renvoie déjà `{ clean, refus, noshow, todo }`, et `todo` **est** la balance
résiduelle (chambres occupées encore `non_nettoyee`). Il manque : le vocabulaire
comptable explicite (le regroupement « hors charge » et le prédicat « à zéro »).
Le patron de référence est la caisse : `isBalanced(s)`
(`src/lib/caisse/calc.ts:42-46`) — un prédicat pur consommé par l'UI pour colorer
et garder la clôture. On reproduit la forme (prédicat pur + objet de synthèse),
sans EPSILON (comparaison entière).

Décisions actées : la raison n'est **pas** structurée (D1/D2) — une « Bloquée » =
« utilisée + non nettoyée, à refaire demain », sans sous-catégorie. On expose la
liste des statuts **hors charge** (`refus`/`noshow`) comme une constante dédiée
(`JUSTIFIED_STATUSES`) : c'est elle, et elle seule, qui fait sortir une chambre du
dû ; tout le reste (la Bloquée) reste à faire et roule.

## Fichier(s) impacté(s)

- `src/lib/rapro/reconcile.ts` (nouveau)
- `src/lib/rapro/constants.ts` (modifié — exposer `JUSTIFIED_STATUSES`)

## Travail à réaliser

### 1. Déclarer les statuts « hors charge » (constants.ts)

```ts
// Statuts HORS CHARGE (aucun menage du) : sortent de la balance, ne roulent pas.
// Tout le reste (non_nettoyee = « Bloquee ») = du non fait = reste a faire, roule.
export const JUSTIFIED_STATUSES = ['refus', 'noshow'] as const
```

### 2. Fonction pure de réconciliation (reconcile.ts)

```ts
import { statusOf, JUSTIFIED_STATUSES } from '#/lib/rapro/constants.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

export interface Reconciliation {
  due: number      // chambres occupees (le du) = occupied.size
  clean: number    // nettoyees parmi les dues (fait)
  settled: number  // hors charge (refus/noshow) parmi les dues
  pending: number  // du - clean - settled = reste a nettoyer (roule) = balance
}

const isSettled = (s: RoomStatus) =>
  (JUSTIFIED_STATUSES as readonly string[]).includes(s)

/** Reconcilie un jour : ne raisonne que sur les chambres DUES (occupees PDJ). */
export function reconcile(
  statuses: ReadonlyMap<number, RoomStatus>,
  occupied: ReadonlySet<number>,
): Reconciliation {
  let clean = 0
  let settled = 0
  for (const room of occupied) {
    const s = statusOf(statuses, room)
    if (s === 'nettoyee') clean++
    else if (isSettled(s)) settled++
  }
  const due = occupied.size
  return { due, clean, settled, pending: due - clean - settled }
}

/** Balance a zero : plus aucune chambre due ne reste a nettoyer. */
export function isReconciled(r: Reconciliation): boolean {
  return r.pending === 0
}
```

### 3. Cohérence avec `countStats`

`countStats().todo` et `reconcile().pending` doivent coïncider par construction
(mêmes entrées). **Choix recommandé : réexprimer** `countStats` à partir de
`reconcile` pour une source unique (`todo === pending`), en gardant les compteurs
`clean`/`refus`/`noshow` déjà utilisés par les cards.

## Ordre d'exécution

1. Ajouter `JUSTIFIED_STATUSES` dans `constants.ts`.
2. Créer `reconcile.ts` (`reconcile`, `isReconciled`, type `Reconciliation`).
3. (Recommandé) réexprimer `countStats` via `reconcile` pour une source unique.
4. `npx tsc --noEmit`.

## Critère de validation

- `reconcile(statuses, occupied).pending` égale l'ancien `countStats().todo` sur les mêmes entrées.
- `settled` ne compte que `refus`/`noshow` ; la « Bloquée » reste dans `pending`.
- `isReconciled` renvoie `true` uniquement quand toute chambre due est nettoyée ou hors charge.
- Aucune dépendance React/Supabase dans `reconcile.ts` (métier pur).
- `npx tsc --noEmit` vert.

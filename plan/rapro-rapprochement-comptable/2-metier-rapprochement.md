# Étape 2 — Métier : rapprochement Réception / Étages / Écart

## Objectif

Calculer, en **métier pur**, le rapprochement comptable du jour : le total
**Réception (1)**, le total **Étages (2)** et l'**écart (1)−(2)** (qui doit tomber
à 0). Sans toucher à `reconcile()` (balance/roulement) — c'est une **fonction
séparée** pour ne pas mêler le comptable et l'opérationnel.

## Contexte

`reconcile()` (`src/lib/rapro/reconcile.ts`) calcule la balance sur le **dû
élargi** (occupées ∪ reportées) et `settled` y inclut `noshow` — deux raisons de
**ne pas** le réutiliser tel quel pour le comptable, qui raisonne **jour seul** et
**exclut** les no-show. On ajoute donc une fonction dédiée.

Décisions applicables : **D1** (source de la Réception : occupation PDJ, option A),
**D2** (bloquées = jour seul `stats.todo`, option A). `countStats(statuses,
occupied)` (`constants.ts`) fournit déjà `{clean, refus, noshow, todo}` sur le jour.

## Fichier(s) impacté(s)

- `src/lib/rapro/accounting.ts` (nouveau)

## Travail à réaliser

### 1. Fonction pure `reconcileAccounting` (accounting.ts)

```ts
export interface Accounting {
  // Reception (1)
  occupancy: number     // occupees du jour (PDJ) = occupied.size
  lateArrivals: number  // saisi (rapro_sheets)
  corrections: number   // saisi, peut etre negatif
  reception: number     // occupancy + lateArrivals + corrections
  // Etages (2)
  clean: number         // nettoyees du jour
  refus: number         // refus du jour
  blocked: number       // bloquees du jour (D2 = stats.todo)
  etages: number        // clean + refus + blocked
  // Ecart
  ecart: number         // reception - etages (doit valoir 0)
}

export function reconcileAccounting(input: {
  occupancy: number
  lateArrivals: number
  corrections: number
  clean: number
  refus: number
  blocked: number
}): Accounting {
  const reception = input.occupancy + input.lateArrivals + input.corrections
  const etages = input.clean + input.refus + input.blocked
  return { ...input, reception, etages, ecart: reception - etages }
}

export const isEcartNul = (a: Accounting): boolean => a.ecart === 0
```

Note comptable : sans saisie manuelle, `blocked = occupancy − clean − refus`
(toute occupée est nettoyée, refus ou bloquée), donc `etages = occupancy` et
`ecart = lateArrivals + corrections`. L'écart met en lumière **précisément** les
ajustements Réception non reflétés côté grille — le but recherché.

### 2. Ligne de contrôle OCC (D1 = PDJ + contrôle)

`Accounting` porte un champ optionnel `officialOcc?: number` (OCC officiel PMS,
depuis `daily_reports.rj_nuitees` lu à **date = jour − 1**) et l'écart de contrôle
`occGap = occupancy − officialOcc` (calculé seulement si `officialOcc != null`).
C'est purement **informatif** : ça ne change PAS `reception`/`etages`/`ecart`
(base = PDJ). Si l'OCC officiel est absent (RepJour non importé ce jour-là), la
ligne de contrôle ne s'affiche pas.

```ts
export interface Accounting {
  // … champs ci-dessus
  officialOcc: number | null   // OCC PMS (daily_reports, jour-1), ou null
  occGap: number | null        // occupancy - officialOcc (controle), ou null
}
```

## Ordre d'exécution

1. Créer `accounting.ts` (`reconcileAccounting`, `isEcartNul`, type `Accounting`).
2. `npx tsc --noEmit`.

## Critère de validation

- Jour équilibré (pas d'arrivée tardive ni correction) → `ecart === 0`.
- Une correction de +2 ou une arrivée tardive fait apparaître un écart cohérent.
- `blocked` = bloquées **du jour** (D2), pas le roulement ; no-show **exclus** des deux totaux.
- Métier pur (aucun React/Supabase). `npx tsc --noEmit` vert.

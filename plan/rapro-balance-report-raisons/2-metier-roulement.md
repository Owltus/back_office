# Étape 2 — Métier : roulement calculé multi-jours

## Objectif

Introduire le **report / roulement** : une chambre due non résolue un jour doit
apparaître les jours suivants comme **toujours due**, tant qu'elle n'est pas
nettoyée ou justifiée (`refus`/`noshow`) — **y compris à travers une clôture**
(voir D7). Approche **calculée** (D3) : on **dérive** les chambres reportées en
relisant les jours précédents. Aucun changement de schéma, aucune écriture, la
convention « absence = défaut » préservée.

## Contexte

Aujourd'hui, seule la card « Bloquées de la veille » lit un unique jour J-1
(`RaproBoard.tsx:124-148`), en lecture seule, sans jamais lier les données d'un
jour à l'autre. Le patron de report de la caisse (`fetchPreviousSheet`,
`src/lib/caisse/service.ts:110-133`) montre le principe « lire le jour précédent
pour amorcer le courant », mais sa sémantique (report d'un **fond constant**) ne
se transpose pas : ici on reporte un **passif décrémental** (des chambres dues qui
restent dues jusqu'à résolution). C'est la brique la plus neuve.

Point de sémantique important : une chambre bloquée hier peut être **inoccupée**
aujourd'hui au PDJ (départ du client) mais **doit quand même être nettoyée**. Le
roulement **élargit donc l'ensemble « à réconcilier »** :
`à réconcilier(J) = occupées(J) ∪ reportées(< J non résolues)`.

**Robustesse « après clôture » (D7).** Comme le report est **calculé** (rien n'est
figé au moment de la clôture), il est naturellement résistant aux données qui
tombent tard : si l'occupation d'un jour antérieur change après sa clôture (une
arrivée tardive s'ajoute au PDJ), la balance et les reportées se **recalculent**
au prochain affichage — aucune valeur périmée. La règle retenue (D7, recommandée)
est que la clôture **ne fige pas** le roulement : une chambre bloquée reste
reportée après la clôture de son jour, jusqu'à résolution par un **statut réel**
(`nettoyee`/`refus`/`noshow`). Le look-back est **borné** (fenêtre de N jours, D4)
pour éviter une traîne infinie.

## Fichier(s) impacté(s)

- `src/lib/rapro/carryover.ts` (nouveau)
- `src/lib/rapro/service.ts` (modifié — lecture d'une plage de jours)
- (consommé à l'étape 3 par `RaproBoard.tsx`)

## Travail à réaliser

### 1. Fenêtre de jours à relire (service.ts)

Fournir de quoi lire les statuts et l'occupation sur une petite plage `[borne,
J-1]`. Réutiliser `fetchDay` (rapro) et `fetchPdjDay` (PDJ) par jour. La borne =
`max(J − N, plus ancien jour disponible)` (D4 : N à fixer, ex. 7).

```ts
// Jours a relire pour le roulement, du plus recent au plus ancien, borne inclus.
export function carryoverWindow(current: string, lowerBound: string): string[] {
  const days: string[] = []
  for (let d = addDays(current, -1); d >= lowerBound; d = addDays(d, -1)) {
    days.push(d)
  }
  return days
}
```

### 2. Dérivation des chambres reportées (carryover.ts)

Pure ; reçoit, pour chaque jour antérieur de la fenêtre, ses `statuses` et son
`occupied`, plus les statuts du jour courant. Une chambre est **reportée** si :
elle était due (occupée) un jour antérieur, y était non résolue, et n'a été
résolue **aucun** jour ultérieur jusqu'au jour courant inclus. La clôture d'un
jour intermédiaire **n'interrompt pas** ce calcul (D7).

```ts
export interface DaySnapshot {
  statuses: ReadonlyMap<number, RoomStatus>
  occupied: ReadonlySet<number>
}

/** Ensemble des chambres reportees (dues anterieurement, jamais resolues). */
export function carryOver(
  past: DaySnapshot[],          // du plus ancien au plus recent, < J
  current: DaySnapshot,         // jour J
): Set<number> {
  const carried = new Set<number>()
  const resolvedSince = (room: number, from: number): boolean => {
    for (let i = from; i < past.length; i++) {
      if (isResolved(statusOf(past[i].statuses, room))) return true
    }
    return isResolved(statusOf(current.statuses, room))
  }
  past.forEach((snap, i) => {
    for (const room of snap.occupied) {
      if (isResolved(statusOf(snap.statuses, room))) continue
      if (!resolvedSince(room, i + 1)) carried.add(room)
    }
  })
  return carried
}

// resolue = nettoyee OU justifiee (refus/noshow). Derive de l'etape 1.
function isResolved(s: RoomStatus): boolean {
  return s === 'nettoyee' || (JUSTIFIED_STATUSES as readonly string[]).includes(s)
}
```

### 3. Réconciliation élargie

À l'étape 3, l'ensemble « dû » du jour devient `occupied ∪ carried`. La balance de
l'étape 1 se recalcule sur cet ensemble élargi (une chambre reportée non résolue
aujourd'hui compte dans la balance, même inoccupée au PDJ du jour).

## Ordre d'exécution

1. Ajouter `carryoverWindow` (service.ts) et créer `carryover.ts`.
2. Prévoir l'assemblage des `DaySnapshot` côté board (étape 3) via les queries existantes.
3. `npx tsc --noEmit`.

## Critère de validation

- Une chambre bloquée à J, inoccupée et non nettoyée à J+1, apparaît **reportée** à J+1 ; `refus`/`noshow` ne roulent pas (hors charge).
- Elle continue de rouler **même après clôture** de J, jusqu'à résolution (nettoyée ou passée hors charge) (D7).
- Dès qu'elle est nettoyée/justifiée un jour ultérieur, elle **cesse** de rouler.
- Aucune écriture en base ; la fenêtre de lecture est **bornée** (pas de traîne infinie).
- Robuste aux jours sans occupation PDJ (jour ignoré du calcul, documenté — pas de plantage) et aux données PDJ qui changent après coup (recalcul dérivé).
- `npx tsc --noEmit` vert.

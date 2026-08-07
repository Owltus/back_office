# Étape 5 — Cohérence des chambres hors inventaire (PDJ)

## Objectif

Garantir que le PDF PDJ auto est cohérent avec lui-même (tuiles de pied de page ==
grille dessinée) et avec la feuille imprimée côté client, même si le CSV contient
une chambre hors des 80 chambres connues.

## Contexte

`computeStats` (serveur) itère sur TOUTES les lignes de `pdj_breakfasts` du jour,
tandis que la grille PDF (`floorsOf`) et le board client n'affichent/comptent que
les chambres de l'inventaire (`ALL_ROOMS`). Une ligne avec un numéro hors
inventaire (salle de séminaire, « 0 », faute PMS) est persistée (le filtre import
n'exige qu'un numéro numérique) → les tuiles comptent 41 mais la grille en dessine
40, et le total du mail auto diffère de la feuille imprimée.

## Fichier(s) impacté(s)

- `supabase/functions/import-report/autoSendPdj.ts`

## Travail à réaliser

### 1. Restreindre `computeStats` à l'inventaire dessiné

Aligner la source des stats sur celle de la grille. Le plan d'étages serveur est
défini dans `_shared/pdj/pdf.ts` (ensemble des chambres dessinées). Filtrer les
lignes de `computeStats` (et la liste passée au rendu) sur cet inventaire, de sorte
qu'une chambre hors plan ne soit ni comptée ni attendue dans la grille.

Approche : exposer/So réutiliser l'ensemble des chambres connues (déjà présent
côté `pdf.ts` via `floorsOf`/la constante des étages) et, dans `autoSendPdj.ts`,
ne conserver que `rows` dont `room` appartient à cet ensemble avant `computeStats`
et avant construction de `sheetRows`. Logger le nombre de lignes écartées.

```ts
import { KNOWN_ROOMS } from '../_shared/pdj/pdf.ts' // set des chambres dessinees
...
const inInventory = breakfastRows.filter((r) => KNOWN_ROOMS.has(r.room))
const dropped = breakfastRows.length - inInventory.length
if (dropped > 0) console.warn(`PDJ auto : ${dropped} chambre(s) hors inventaire ignoree(s)`)
// computeStats(inInventory) et sheetRows a partir de inInventory
```

Si `pdf.ts` n'expose pas encore d'ensemble réutilisable, l'ajouter (export nommé
dérivé de la définition d'étages existante) sans dupliquer la liste.

## Ordre d'exécution

1. Vérifier la structure des chambres dans `_shared/pdj/pdf.ts`.
2. Exposer un `KNOWN_ROOMS` (Set) si absent, dérivé de la définition existante.
3. Filtrer dans `autoSendPdj.ts` avant stats + rendu.

## Critère de validation

- `deno check` OK.
- Raisonnement : tuiles de pied de page == nombre de chambres dessinées ; parité
  avec le calcul client (`BreakfastBoard` itère aussi sur l'inventaire).

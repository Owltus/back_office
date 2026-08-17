# Étape 2 — Statut `employe` côté frontend

## Objectif

Rendre le statut `employe` sélectionnable et visible dans le planning
`/parking` : type, couleur, libellé, entrée dans le cycle de statut (menu
contextuel) et dans la légende. Aucun changement de logique de calcul côté
planning — le TO de tête de colonne (`dayInfo`, lignes ~631-650) est déjà
indépendant du statut (il compte toutes les réservations quel que soit leur
`status`), donc une réservation `employe` y sera automatiquement représentée
sans aucune modification.

## Fichier(s) impacté(s)

- `src/lib/parking/model.ts`
- `src/components/parking/ParkingBoard.tsx`

## Travail à réaliser

### 1. `src/lib/parking/model.ts` — étendre le type `Status`

```ts
export type Status = 'reserve' | 'paye' | 'checkout' | 'employe'
```

Ligne 32. Aucun autre changement dans ce fichier : `Reservation`, `hasOverlap`
et les calculs de créneaux sont déjà agnostiques du statut.

### 2. `src/components/parking/ParkingBoard.tsx` — couleur, libellé, ordre

Ajouter une entrée `employe` au record `STATUS` (lignes 146-171) et à
`STATUS_ORDER` (ligne 172). Couleur proposée : violet, teinte encore inutilisée
parmi les statuts existants (gris/vert/orange) :

```tsx
const STATUS: Record<
  Status,
  { label: string; border: string; fill: string; text: string; dot: string }
> = {
  reserve: { /* inchangé */ },
  paye: { /* inchangé */ },
  checkout: { /* inchangé */ },
  employe: {
    label: 'Employé',
    border: 'border-violet-500/50',
    fill: 'bg-violet-500/15',
    text: 'text-violet-700 dark:text-violet-100',
    dot: 'bg-violet-500',
  },
}
const STATUS_ORDER: Status[] = ['reserve', 'paye', 'checkout', 'employe']
```

`STATUS_ORDER` pilote automatiquement :
- la légende du planning (ligne ~1632, boucle sur `STATUS_ORDER`)
- le menu contextuel radio de changement de statut (`ContextMenuRadioGroup`,
  lignes ~1904-1916, boucle sur `STATUS_ORDER`)

Aucune modification requise dans `setStatus` (lignes 918-938) : la modale de
justification obligatoire ne se déclenche que pour `status === 'checkout'`
(ligne 929) — passer en `employe` suit directement le chemin générique
(écriture immédiate, sans modale), comme `reserve`/`paye`.

## Ordre d'exécution

1. `model.ts` (type `Status`).
2. `ParkingBoard.tsx` (`STATUS`, `STATUS_ORDER`).

## Critère de validation

- `npx tsc --noEmit`
- `npx vitest run` (aucune régression attendue — `history.test.ts` utilise
  des littéraux `Status` existants, non affectés par l'ajout d'une 4e valeur
  à l'union)
- Vérification visuelle sur `/parking` : le menu contextuel (clic droit sur
  une réservation) propose "Employé" dans la liste des statuts, le
  sélectionner colore la barre en violet, la légende affiche la nouvelle
  puce, et le compteur de TO en tête de colonne du jour concerné change bien
  (la réservation employé y est comptée, comme avant/après tout autre statut).

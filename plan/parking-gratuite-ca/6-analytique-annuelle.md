# Étape 6 — Vue analytique annuelle (ParkingAnalytiqueBoard.tsx)

## Objectif

Ajouter deux cartes KPI (« Gratuité », « CA Parking ») et deux colonnes au
tableau annuel (Gratuité, CA), sur le modèle exact des cartes/colonnes
existantes (Impayés, Captage).

## Fichier(s) impacté(s)

- `src/components/parking/ParkingAnalytiqueBoard.tsx` (modifié)

## Travail à réaliser

### 1. Cartes KPI

Grille actuelle : `AnalytiqueCardsGrid cols={5}` avec 5 `StatCard`
(Réservations, Taux d'occupation moyen, Nuits totales, Impayés, Captage,
`ParkingAnalytiqueBoard.tsx:200-246`). Passer à `cols={7}` et insérer deux
`StatCard`, sur le modèle de la carte Impayés :

```tsx
<StatCard
  label="Gratuité"
  accent={ACCENT.sky}
  value={fmtInt(summary.totalFree)}
  hint="Réservations en gratuité sur la période."
  sub={shareSub(summary.totalFree, summary.totalReservations, 'des réservations')}
/>
<StatCard
  label="CA Parking"
  accent={ACCENT.emerald}
  value={fmtEur(summary.totalCaTtc)}
  hint="Chiffre d'affaires TTC (réservé/payé/non payé), hors employé et gratuité."
/>
```

(Vérifier le nom exact de la clé `ACCENT` disponible pour le bleu/sky dans
ce fichier avant d'écrire le code — s'aligner sur les clés déjà utilisées
plutôt que d'en inventer une nouvelle si une équivalente existe.)

Le `summary` agrégé sur l'année entière (calcul déjà fait quelque part dans
ce composant pour produire `totalReservations`/`totalUnpaid`/etc. à partir
du tableau de `ParkingMonthStats`) doit gagner `totalFree` (somme de
`free`) et `totalCaTtc`/`totalCaHt` (somme de `caTtc`/`caHt`) — même
pattern de réduction que les totaux existants.

### 2. Colonnes du tableau annuel

En-têtes (`ParkingAnalytiqueBoard.tsx:250-292`) : ajouter `Gratuité` (classe
`hidden sm:table-cell`, comme Payées/Réservées) et `CA` (toujours visible,
comme Captage).

Corps (`ParkingAnalytiqueBoard.tsx:323-361`) : ajouter les `<td>`
correspondants dans le même ordre, avec `fmtInt(m.free)` et
`fmtEur(m.caTtc)`.

Branche « pas de données » (`ParkingAnalytiqueBoard.tsx:362-382`) :
recalculer le `colSpan` pour inclure les deux nouvelles colonnes.

## Ordre d'exécution

1. Étendre le calcul de `summary` (totaux annuels) avec `totalFree`,
   `totalCaHt`, `totalCaTtc`.
2. Ajouter les deux cartes KPI.
3. Ajouter les deux colonnes du tableau (en-tête + corps + colSpan de la
   branche vide).
4. Vérification visuelle en navigateur (`pnpm dev`, `/parking/analytique`).

## Critère de validation

- `npx tsc --noEmit` : vert.
- 7 cartes KPI affichées, dans l'ordre attendu, sans retour à la ligne
  cassé sur desktop.
- Colonne Gratuité masquée sous `sm` (comme Payées/Réservées), colonne CA
  toujours visible.
- Somme des `m.free` sur les 12 lignes du tableau = valeur de la carte
  « Gratuité ». Idem pour le CA.
- La branche « pas de données » (année sans aucune réservation) affiche
  toujours un tableau cohérent, sans colonne orpheline.

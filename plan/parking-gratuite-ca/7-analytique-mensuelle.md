# Étape 7 — Vue analytique mensuelle (ParkingAnalytiqueMoisBoard.tsx)

## Objectif

Ajouter deux cartes KPI (« Gratuité », « CA Parking ») et une colonne
« Gratuité » au tableau jour par jour.

## Contexte

Le CA n'existe qu'au niveau mensuel (`ParkingMonthStats.caHt`/`caTtc`, issu
de `parking_arrivals_agg` groupé par mois d'arrivée) — PAS au niveau
journalier (`ParkingDayStats` n'a pas de champ CA, seulement
`occupiedFree`). La carte « CA Parking » de cette page affiche donc le CA du
MOIS entier affiché (une seule valeur), tandis que le tableau jour par jour
ne gagne qu'une colonne « Gratuité » (comptage de places, pas de CA par
jour).

## Fichier(s) impacté(s)

- `src/components/parking/ParkingAnalytiqueMoisBoard.tsx` (modifié)

## Travail à réaliser

### 1. Cartes KPI

Grille actuelle : `cols={5}` avec Taux d'occupation moyen, Arrivées,
Départs, Impayés, Captage (`ParkingAnalytiqueMoisBoard.tsx:201-243`). Passer
à `cols={7}`, ajouter :

```tsx
<StatCard
  label="Gratuité"
  accent={ACCENT.sky}
  value={fmtInt(monthStats.free)}
  hint="Réservations en gratuité arrivées ce mois-ci."
/>
<StatCard
  label="CA Parking"
  accent={ACCENT.emerald}
  value={fmtEur(monthStats.caTtc)}
  hint="Chiffre d'affaires TTC du mois (réservé/payé/non payé), hors employé et gratuité."
/>
```

`monthStats` désigne ici la ligne `ParkingMonthStats` du mois affiché
(probablement déjà récupérée quelque part dans ce composant pour les cartes
Impayés/Captage existantes — réutiliser le même accès, pas une nouvelle
requête).

### 2. Colonne « Gratuité » du tableau jour par jour

En-tête (`ParkingAnalytiqueMoisBoard.tsx:246-281`, colonnes actuelles :
Jour, Occupation, Occupées, Arrivées, Départs, Captage) : ajouter
« Gratuité » après « Occupées ».

Corps (`ParkingAnalytiqueMoisBoard.tsx:285-345`) : `<td>{fmtInt(d.occupiedFree)}</td>`
pour chaque jour.

Branche vide (`colSpan={5}` ligne 337) : passer à `colSpan={6}`.

## Ordre d'exécution

1. Ajouter les deux cartes KPI (réutiliser l'accès existant au
   `ParkingMonthStats` du mois affiché).
2. Ajouter la colonne « Gratuité » au tableau jour par jour (en-tête + corps
   + `colSpan` de la branche vide).
3. Vérification visuelle en navigateur.

## Critère de validation

- `npx tsc --noEmit` : vert.
- 7 cartes KPI, dans l'ordre attendu.
- Colonne « Gratuité » affichée pour chaque jour du mois, cohérente avec les
  places réellement en statut `gratuite` ce jour-là (vérifiable en
  comparant avec le board `/parking` sur une date de test).
- La carte « CA Parking » de ce mois correspond à la valeur de la ligne du
  mois correspondant dans le tableau annuel de l'étape 6 (même chiffre, deux
  vues différentes).

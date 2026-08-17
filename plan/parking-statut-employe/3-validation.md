# Étape 3 — Validation globale

## Objectif

Vérifier bout en bout que le statut `employe` se comporte exactement comme
demandé : représenté dans le planning `/parking` (barre, légende, TO de tête
de colonne), mais totalement absent des chiffres analytiques (`/parking/
analytique`, `/parking/analytique/$year/$month`, bande transverse
`/repjour`).

## Fichier(s) impacté(s)

Aucun — étape de vérification uniquement.

## Travail à réaliser

### 1. Vérifications statiques

- `npx tsc --noEmit`
- `npx vitest run`
- `npx eslint` sur les fichiers touchés (vérifier l'absence de nouvelle
  erreur — des erreurs préexistantes non liées à ce chantier peuvent
  subsister, à ne pas corriger ici)

### 2. Vérification fonctionnelle (navigateur, dev server `pnpm dev`)

Scénario à dérouler sur `/parking` :
1. Créer ou choisir une réservation sur une place 1-12, un jour avec au
   moins une autre réservation active pour avoir un TO de référence non nul.
2. Relever le TO affiché en tête de la colonne de ce jour.
3. Passer cette réservation en statut "Employé" (clic droit → menu radio).
4. Vérifier que la barre devient violette, le libellé "Employé" apparaît
   dans la légende.
5. Vérifier que le TO en tête de colonne du jour N'A PAS BAISSÉ (la
   réservation employé continue d'être comptée dans le planning lui-même —
   c'est le comportement voulu, différent des pages analytiques).

Puis sur `/parking/analytique` et `/parking/analytique/$year/$month` (mois
contenant le jour testé) :
6. Vérifier que le TO / captage / nombre de réservations affichés pour ce
   jour a BAISSÉ (ou n'a pas augmenté) après le passage en "Employé" —
   comparer avant/après si possible, ou au minimum vérifier que la
   réservation employé n'apparaît dans aucune colonne de répartition
   (payé/réservé/non payé).

Puis sur `/repjour` (bande de synthèse transverse, bloc Parking, jour
testé) :
7. Vérifier que les cartes Occupation/Arrivées/Départs/Captage reflètent
   elles aussi l'exclusion (mêmes valeurs qu'avant l'ajout de la réservation
   employé, ou baisse cohérente si la résa existait déjà en un autre statut).

## Ordre d'exécution

1. Vérifications statiques (tsc, vitest, eslint).
2. Scénario navigateur planning (étapes 1-5).
3. Scénario navigateur analytique + bande RepJour (étapes 6-7).

## Critère de validation

- Toutes les commandes de l'étape 1 passent sans nouvelle erreur.
- Le TO de tête de colonne du planning `/parking` INCLUT la réservation
  employé (inchangé par ce chantier).
- Le TO / captage des pages `/parking/analytique*` et de la bande `/repjour`
  EXCLUENT la réservation employé.

## Contrôle /borg

Étape critique car dernière étape de validation globale du chantier (règle
de marquage automatique). Points à auditer :
- Cohérence entre les deux vues SQL (`parking_arrivals_agg` et
  `parking_daily_occupation`) : une même réservation employé ne doit
  apparaître dans AUCUNE des deux, pour éviter un écart entre l'analytique
  annuel et mensuel.
- Pas de régression sur le TO du planning lui-même (`dayInfo` dans
  `ParkingBoard.tsx`) : ce calcul ne doit PAS avoir été touché par l'étape 1
  ou 2 — c'est un point de non-régression explicite du chantier.

# Étape 8 — Tests + validation globale

## Objectif

Étendre les tests existants d'agrégation avec le statut gratuité et le CA,
puis valider l'ensemble du chantier (statique + manuel navigateur).

## Fichier(s) impacté(s)

- `src/lib/parking/analytics.test.ts` (modifié)

## Travail à réaliser

### 1. Étendre les tests `aggregateParkingMonthly`

Sur le modèle du test existant (`analytics.test.ts:52-73`, lignes mock
`ParkingArrivalsRow[]`) : ajouter des lignes avec `free`, `free_nights`,
`ca_ht`, `ca_ttc` renseignés, et vérifier que `aggregateParkingMonthly` les
somme correctement par mois — même structure d'assertion que les champs
`paid`/`reserved`/`unpaid` déjà testés. Cas à couvrir :

- Une ligne avec `free > 0` et `ca_ht`/`ca_ttc` à 0 (réservation gratuité
  pure) — vérifie que le CA n'inclut jamais la gratuité.
- Une ligne `paid`/`reserved`/`checkout` avec `ca_ht`/`ca_ttc` > 0 — vérifie
  la sommation correcte.
- Deux lignes sur le même mois avec des tarifs différents (simulé
  directement dans les `ca_ht`/`ca_ttc` mockés, pas besoin de simuler
  `parking_tarifs` côté test TS — le calcul du tarif applicable est fait en
  SQL, testé séparément via la requête de contrôle de l'étape 2) — vérifie
  que la somme TS ne recalcule rien, se contente d'additionner.

### 2. Étendre les tests `aggregateParkingDaily`

Sur le modèle du test existant (`analytics.test.ts:76-95`) : ajouter
`occupied_free` aux lignes mock `ParkingDailyOccRow[]`, vérifier le mapping
vers `occupiedFree` dans `ParkingDayStats`, y compris pour un jour absent de
la vue (repli à 0, comme les autres champs).

### 3. Validation statique

- `npx tsc --noEmit`
- `npx vitest run` (ou `npx vitest run src/lib/parking/`)
- `npx eslint` sur tous les fichiers touchés par ce chantier
- `pnpm build` — vérifier qu'aucun chunk n'explose et que le build passe

### 4. Validation manuelle en navigateur

Prérequis : les SQL des étapes 1 et 2 ont été exécutés par l'utilisateur
dans Supabase.

1. `/parking` : créer/modifier une réservation en statut « Gratuité » sur
   une place client (< 13). Vérifier qu'elle apparaît avec la teinte
   attendue, dans le menu contextuel et la légende.
2. `/parking/analytique` (vue annuelle) : vérifier que le mois de cette
   réservation affiche une « Gratuité » ≥ 1, que l'occupation générale
   inclut bien cette réservation (contrairement à un test similaire avec
   « Employé », qui ne doit rien changer aux totaux), et qu'une carte « CA
   Parking » cohérente s'affiche (0 € de contribution pour cette
   réservation gratuité elle-même, mais reflétant les réservations payantes
   du mois).
3. `/parking/analytique/<année>/<mois>` (vue mensuelle) : le jour de la
   réservation gratuité affiche « Gratuité » ≥ 1 dans le tableau jour par
   jour ; la carte CA du mois correspond à la ligne du mois dans le tableau
   annuel.
4. Contrôle croisé SQL : `select * from public.parking_arrivals_agg where
   start_date = '<date de test>'` doit montrer `free = 1` (ou plus) et un
   `ca_ttc` cohérent avec les seules réservations facturables de ce jour.

## Critère de validation

- Tous les tests passent (`npx vitest run`), y compris les nouveaux.
- `npx tsc --noEmit`, `npx eslint`, `pnpm build` verts.
- Les 4 vérifications manuelles ci-dessus concordent (board, vue annuelle,
  vue mensuelle, SQL direct) sans divergence de chiffres.
- Un statut `employe` de test reste invisible partout (comportement
  inchangé — seule `gratuite` change de comportement dans ce chantier).

## Contrôle /borg

Étape critique (validation globale de fin de chantier) :

- Cohérence bout en bout des chiffres entre les 4 points de vérification
  manuelle (SQL brut, board, annuel, mensuel) — un écart signale une erreur
  de mapping quelque part dans la chaîne SQL → service.ts → analytics.ts →
  UI.
- Aucune régression sur les métriques déjà en production (Réservations,
  Taux d'occupation, Nuits totales, Impayés, Captage) : les valeurs
  affichées après ce chantier, pour une période sans aucune réservation
  `gratuite`, doivent être STRICTEMENT identiques à avant le chantier.
- Vérifier qu'aucune donnée `employe` ne fuite dans les nouveaux champs
  `free`/`ca_ht`/`ca_ttc`/`occupied_free` (les filtres `status = 'gratuite'`
  et `status in ('reserve','paye','checkout')` sont mutuellement exclusifs
  d'`employe`).
- Vérifier que la table `parking_tarifs` n'est jamais modifiée (`update`)
  ni supprimée (`delete`) nulle part dans le code applicatif — seule
  l'insertion via `set_parking_tarif` doit exister comme canal d'écriture,
  pour garantir l'immutabilité de l'historique tarifaire.

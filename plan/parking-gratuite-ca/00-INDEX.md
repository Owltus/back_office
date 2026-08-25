# Plan — Parking : statut « gratuité » + CA paramétrable

## Contexte

Le planning Parking ne connaît aujourd'hui que quatre statuts (`reserve`,
`paye`, `checkout`, `employe`) et ne calcule aucun chiffre d'affaires — la
table `parking_reservations` ne porte aucun tarif, et les deux vues
analytiques (`parking_arrivals_agg`, `parking_daily_occupation`) excluent
entièrement le statut `employe` de tous leurs totaux.

Deux besoins :

1. Un cinquième statut **« gratuité »**, distinct de `employe` : une place en
   gratuité ne doit jamais compter comme occupation employé, mais DOIT
   compter dans l'occupation générale et les nuitées (contrairement à
   `employe`, aujourd'hui exclu de tout), avec en plus une colonne dédiée
   « Gratuité » dans les deux vues analytiques (annuelle et mensuelle), sur
   le modèle des colonnes payé/réservé/impayé déjà présentes.

2. Un **calcul de chiffre d'affaires**, basé sur un prix (~20 € TTC) et un
   taux de TVA (~10 %) qui peuvent changer dans le temps. Ces deux valeurs
   doivent être **paramétrables en base** (jamais en dur dans le code TS) et
   **versionnées** (date d'effet) pour qu'un changement futur de tarif ne
   modifie jamais un CA déjà calculé sur une période passée. Le CA ne porte
   que sur les nuitées facturables (`reserve`/`paye`/`checkout`) — ni
   `employe` (jamais facturé), ni `gratuite` (gratuite par définition).

Aucun pattern de configuration versionnée dans le temps n'existe ailleurs
dans l'app (confirmé par exploration : `repjour/constants.ts` a un
`VAT_RATE` fixé en dur ; le seul mécanisme de « tarif non codé en dur »,
`lib/pdj/tarif.ts`, DÉTECTE un prix a posteriori depuis des revenus réels
externes — non transposable ici, le parking n'a pas de source externe
équivalente). Ce chantier introduit donc ce pattern pour la première fois.

## Décisions actées (validées le 2026-08-25)

Toutes les hypothèses par défaut ont été soumises à l'utilisateur
(6 questions) et confirmées telles quelles — rien à ajuster dans les étapes
qui suivent :

- **Base du prix (20 €)** : **TTC** (c'est le prix affiché au client). Le HT
  est dérivé (`TTC / (1 + taux/100)`), comme `fromTTC` dans
  `repjour/constants.ts`.
- **Granularité du tarif appliqué à une réservation** : une réservation est
  facturée au tarif en vigueur à sa **date d'arrivée** (`start_date`), pour
  la totalité de ses nuitées — pas un recalcul nuit par nuit si le tarif
  change en cours de séjour. Même simplification que celle déjà en place
  pour les nuitées (`parking_arrivals_agg` attribue déjà toutes les nuits
  d'une réservation à son mois d'arrivée, sans les répartir).
- **Amorçage du tarif initial** : la première ligne de `parking_tarifs`
  (20 € TTC / 10 %) est datée dynamiquement à la plus ancienne réservation
  connue (`min(start_date)` de `parking_reservations`), pour couvrir
  rétroactivement tout l'historique existant.
- **Écriture d'un nouveau tarif** : pas d'écran de configuration dédié — un
  changement de prix/TVA s'ajoute en exécutant un nouvel `insert` (via la
  RPC admin `set_parking_tarif`) dans Supabase → SQL Editor, comme les
  autres paramètres versionnés du projet.
- **Motif obligatoire pour « gratuité »** : **non** — contrairement à
  `checkout` (« Non payé », qui exige un commentaire écrit avant d'écrire le
  statut), « gratuité » s'applique directement, sans justification requise.
- **Couleur/libellé de « gratuité »** : `sky` (bleu ciel), libellé
  « Gratuité » — les quatre teintes existantes (slate/emerald/orange/violet)
  sont déjà prises.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-sql-statut-gratuite-et-table-tarifs.md](./1-sql-statut-gratuite-et-table-tarifs.md) | SQL — statut + table tarifs | — | P0 | 1h | Contrainte élargie + table `parking_tarifs` versionnée (RLS + RPC admin + seed) | ⚠ |
| 2 | [2-sql-vues-analytiques-gratuite-ca.md](./2-sql-vues-analytiques-gratuite-ca.md) | SQL — vues analytiques | 1 | P0 | 1h30 | `parking_arrivals_agg`/`parking_daily_occupation` avec colonnes gratuité + CA | ⚠ |
| 3 | [3-modele-statut-et-board.md](./3-modele-statut-et-board.md) | Modèle statut + board | 1 | P0 | 30 min | `Status` étendu, menu contextuel + légende affichent « Gratuité » | — |
| 4 | [4-lib-analytics-service.md](./4-lib-analytics-service.md) | Lib analytics + service | 2 | P0 | 1h | `service.ts`/`analytics.ts` exposent gratuité + CA en TS | — |
| 5 | [5-format-monetaire.md](./5-format-monetaire.md) | Formatage monétaire | — | P0 | 15 min | `fmtEur` disponible côté parking | — |
| 6 | [6-analytique-annuelle.md](./6-analytique-annuelle.md) | Vue annuelle | 4, 5 | P1 | 45 min | `ParkingAnalytiqueBoard.tsx` : cartes + colonnes Gratuité/CA | — |
| 7 | [7-analytique-mensuelle.md](./7-analytique-mensuelle.md) | Vue mensuelle | 4, 5 | P1 | 45 min | `ParkingAnalytiqueMoisBoard.tsx` : cartes + colonnes Gratuité/CA | — |
| 8 | [8-tests-et-validation-globale.md](./8-tests-et-validation-globale.md) | Tests + validation globale | 1..7 | P0 | 1h | Tests étendus, `tsc`/`build` verts, vérification navigateur | ⚠ |

## Ordre d'exécution

Séquentiel dans l'ensemble, avec deux points de parallélisation possibles :

1. **Étape 1** en premier — elle produit du SQL (contrainte de statut élargie
   + nouvelle table `parking_tarifs`) à exécuter par l'utilisateur dans
   Supabase → SQL Editor. Aucune étape suivante ne peut être validée en
   conditions réelles tant que ce SQL n'est pas joué (le code peut être écrit
   avant, mais pas testé en base).
2. **Étape 2** dépend de l'étape 1 (la vue CA a besoin de `parking_tarifs`).
   Également du SQL à exécuter par l'utilisateur, ensuite.
3. **Étape 3** (modèle + board) peut démarrer en parallèle de l'étape 2 — elle
   ne dépend que de l'étape 1 (le statut doit exister côté contrainte pour
   être écrit en base, mais le code TS peut être écrit dès que l'étape 1 est
   rédigée, avant même que l'utilisateur ait joué le SQL).
4. **Étape 4** dépend de l'étape 2 (nouvelles colonnes SQL). **Étape 5** est
   indépendante et peut se faire n'importe quand avant l'étape 6/7.
5. **Étapes 6 et 7** sont indépendantes l'une de l'autre (annuelle vs
   mensuelle) — parallélisables entre elles une fois l'étape 4 terminée.
6. **Étape 8** ferme le chantier : tests, `tsc`, `build`, et une vérification
   manuelle en navigateur qui suppose que l'utilisateur a bien exécuté les
   SQL des étapes 1 et 2 au préalable.

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|--------------------|--------------------|
| SQL Supabase | `supabase/parking_analytics_agg.sql` | `supabase/parking_status_gratuite.sql`, `supabase/parking_tarifs.sql` |
| Modèle/UI board | `src/lib/parking/model.ts`, `src/components/parking/ParkingBoard.tsx` | — |
| Lib analytics | `src/lib/parking/service.ts`, `src/lib/parking/analytics.ts`, `src/lib/parking/format.ts` | — |
| UI analytique | `src/components/parking/ParkingAnalytiqueBoard.tsx`, `src/components/parking/ParkingAnalytiqueMoisBoard.tsx` | — |
| Tests | `src/lib/parking/analytics.test.ts` | — |
| **Total** | **8 modifiés** | **2 nouveaux** |

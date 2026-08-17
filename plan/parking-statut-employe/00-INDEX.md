# Plan — Statut "Employé" sur le planning parking

## Contexte

Le planning `/parking` permet de réserver une place pour un client (statuts
`reserve` / `paye` / `checkout`). Certaines places sont en réalité occupées
par des véhicules d'employés de l'hôtel — aujourd'hui, faute de statut dédié,
ces occupations sont comptées comme des réservations client ordinaires et
polluent le taux d'occupation (TO) et le captage affichés sur les pages
analytiques (`/parking/analytique`, `/parking/analytique/$year/$month`) ainsi
que sur la bande de synthèse transverse en bas de `/repjour`.

Objectif : ajouter un 4e statut `employe` qui reste représenté normalement
dans le planning `/parking` lui-même (couleur dédiée, cycle de statut, TO en
tête de colonne inchangé — ce compteur est déjà indépendant du statut), mais
qui est explicitement exclu des agrégats consommés par les pages analytiques.

Exploration effectuée (3 agents parallèles + lecture directe des fichiers) :
tout le TO analytique descend de deux vues SQL (`parking_arrivals_agg`,
`parking_daily_occupation`, définies dans `supabase/parking_analytics_agg.sql`)
— aucun code TypeScript ne relit les lignes brutes de `parking_reservations`
pour ces calculs. C'est donc l'unique point de levier à corriger côté
analytique ; le reste (planning, TO de tête de colonne) n'a rien à changer.

## Angles à clarifier

- **Enum de statut vs champ orthogonal** : ajouter `employe` comme 4e valeur
  du même enum `status` fusionne deux axes différents — "statut de paiement"
  (réservé/payé/non payé) et "nature de l'occupant" (client/employé). Une
  alternative plus propre séparerait un champ booléen `is_staff` du statut de
  paiement, mais c'est plus coûteux (nouvelle colonne, UI supplémentaire, même
  travail de filtrage dans les vues) et l'utilisateur demande explicitement
  "un nouveau statut". Ce plan retient l'extension d'enum (la plus directe) ;
  à trancher si ça ne convient pas.
- **Confusion de nommage avec l'existant** : le modèle a déjà une notion de
  "personnel" au niveau de la PLACE (`FIRST_STAFF_SPOT = 13`, places 13 & 14
  = tampon personnel, déjà exclues du captage mais pas du TO "toutes places").
  Le nouveau statut `employe` est une notion différente et orthogonale (un
  véhicule d'employé peut occuper n'importe quelle place 1-12) — à bien
  distinguer dans les commentaires pour ne pas confondre les deux mécanismes.
- **Couleur/libellé du statut** : proposition = violet (`violet-500`),
  libellé "Employé" — première couleur du genre dans `STATUS`, à ajuster si
  une autre teinte convient mieux visuellement.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-base-de-donnees.md](./1-base-de-donnees.md) | Statut `employe` côté SQL (contrainte + vues analytiques) | — | P0 | 30 min | contrainte étendue, 2 vues filtrées | ⚠ |
| 2 | [2-frontend.md](./2-frontend.md) | Statut `employe` côté frontend (modèle + planning) | — | P1 | 20 min | statut sélectionnable, coloré, affiché | |
| 3 | [3-validation.md](./3-validation.md) | Validation globale | 1, 2 | P0 | 20 min | tsc/tests verts, vérif visuelle planning + analytique | ⚠ |

## Ordre d'exécution

Étapes 1 et 2 sont indépendantes (fichiers disjoints, SQL vs frontend) —
exécutables dans n'importe quel ordre, mais l'étape 3 (validation croisée)
dépend des deux. Exécution proposée : 1 puis 2 puis 3.

Point de vigilance opérationnel : l'étape 1 produit du SQL à exécuter
**par l'utilisateur** dans Supabase → SQL Editor (aucun outil d'exécution
directe côté assistant) — l'étape 3 ne peut valider le comportement
analytique qu'une fois ce SQL joué.

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|--------------------|--------------------|
| Base de données (SQL) | `supabase/parking_analytics_agg.sql` | `supabase/parking_status_employe.sql` |
| Frontend (modèle + UI) | `src/lib/parking/model.ts`, `src/components/parking/ParkingBoard.tsx` | — |

| **Total** | **3 modifiés** | **1 nouveau** |

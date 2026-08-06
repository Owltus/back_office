# Étape 1 — Identité système « StayNTouch »

## Objectif

Créer un **UUID système fixe** pour estampiller `imported_by` sur les imports
automatiques, affiché comme « importé par StayNTouch ». Comme `imported_by` est une
clé étrangère, il faut une vraie ligne en base (pas un UUID inventé).

## Qui

**TOI** (exécution du SQL dans Supabase → SQL Editor). SQL fourni par MOI.

## Fichier(s)

- `supabase/stayntouch_system_identity.sql` (nouveau)

## Travail à réaliser

1. Déterminer la table cible de la FK `imported_by` (probablement `public.profiles`
   dont `id` référence `auth.users`). **À vérifier à l'Étape 3** avant de figer.
2. Créer une identité système :
   - Option A (préférée si `profiles.id` n'exige pas un `auth.users` réel) : insérer
     une ligne `profiles` dédiée avec un UUID fixe (ex. `role='utilisateur'`,
     `full_name='StayNTouch (PMS)'`).
   - Option B (si `profiles.id` DOIT exister dans `auth.users`) : créer un compte
     `auth.users` système sans mot de passe (via SQL admin) puis son profil.
3. Figer l'UUID dans une constante réutilisée par l'Edge Function (Étape 3/4).

## Critère de validation

- L'UUID système existe et satisfait la FK `imported_by` (un insert de test dans
  `daily_reports` avec cet `imported_by` passe).
- L'app affiche « StayNTouch (PMS) » là où elle montre l'auteur d'import.

## Contrôle /borg

Étape critique (FK + identité) : vérifier qu'aucune contrainte n'est violée, que
l'UUID n'entre pas en collision avec un compte réel, et que la ligne système n'a
**aucun droit** (pas de permissions de page) — c'est une simple étiquette.

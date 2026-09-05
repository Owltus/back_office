# Étape 4 — Privilèges du schéma privé, durcissement étendu, `verif_advisor.sql`

## Objectif

Verrouiller les privilèges du schéma `private` de façon explicite et
unique, étendre la boucle de durcissement pour qu'un futur oubli soit
rattrapé automatiquement, et livrer un script de contrôle en lecture seule
qui reproduit les règles du Security Advisor.

## Fichier(s) impacté(s)

- `supabase/lint_hardening_2026-09-05.sql` (modifié : boucle étendue)
- `supabase/verif_advisor.sql` (nouveau)

## Travail à réaliser

### 1. Boucle de durcissement étendue

Dans `lint_hardening_2026-09-05.sql`, la boucle (1) balaie désormais
`nspname in ('public','private')` : ni PUBLIC ni anon sur aucune fonction
`security definer` ; `authenticated` accordé ; et dans `public`, toute
fonction `security definer` non-trigger restante est SIGNALÉE (raise
notice) car elle ne devrait plus exister.

### 2. `verif_advisor.sql`

Modèle `verif_complet.sql` (OK/KO + RESULTAT GLOBAL) :

1. 0 fonction `security definer` non-trigger dans `public` (lint 0029).
2. 0 fonction exécutable par `anon`/PUBLIC dans `public` et `private` (0028).
3. Schéma `private` : `anon` et PUBLIC sans `usage`.
4. 0 extension dans `public` (0014).
5. Toutes les fonctions de `public` et `private` ont `search_path` figé (0011).
6. Toutes les policies contiennent `private.` et aucune `public.get_page_level(`.
7. Les 5 aides existent dans `private`, aucune dans `public`.
8. Relais : pour chaque fonction de `private`, une fonction de même nom et
   même `pg_get_function_arguments` existe dans `public` et n'est pas
   `security definer` (sauf les 5 aides, sans relais).

## Critère de validation

- `verif_advisor.sql` : RESULTAT GLOBAL OK.
- Security Advisor rafraîchi dans le dashboard : plus aucune ligne SQL
  (reste `auth_leaked_password_protection`, réglage Pro).

## Contrôle qualité (revue)

Étape critique (privilèges). `/borg` n'étant pas installé, revue manuelle
ciblée : (1) `has_schema_privilege('anon','private','usage')` = false ;
(2) `service_role` conserve `usage` (Edge Functions futures) ; (3) la boucle
ne touche pas aux fonctions trigger.

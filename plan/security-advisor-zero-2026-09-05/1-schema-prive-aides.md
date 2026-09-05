# Étape 1 — Schéma `private` et fonctions d'aide déplacées

## Objectif

Créer le schéma `private` (non exposé à PostgREST) et y déplacer les cinq
fonctions d'aide des règles de sécurité, puis repointer TOUT ce qui les
appelle (91 policies, 2 triggers, 39 fonctions) vers `private.…`, en une
seule transaction générée depuis le catalogue de prod. À la fin, aucune
fonction d'aide n'existe plus dans `public`.

## Contexte

- `get_page_level` (`page_permissions.sql:79`), `is_admin` (`:34`),
  `get_user_role` (`security_core.sql:101`) : `security definer`
  obligatoire (récursion RLS sinon). `page_level_rank` (`:42`) : pure,
  immutable, sans `set search_path` dans le fichier (dérive vs prod, lint
  0011 rouvert à chaque rejeu). `repjour_manual_forecast_allowed`
  (`page_permissions_rls_repjour.sql:56`) : lit `daily_reports`, appelée
  NUE par 3 policies `forecast_days` (dépend de la ligne).
- Catalogue de prod : 91 policies, 2 fonctions trigger
  (`prevent_self_role_change`, `parking_no_past_rewrite`) et 39 fonctions
  référencent ces aides, toutes en `public.xxx(` explicite (search_path
  figé) ou nu.
- `alter function … set schema private` déplace l'objet en conservant son
  OID : les policies et fonctions qui le référencent par OID continuent de
  fonctionner IMMÉDIATEMENT (la dépendance interne est par OID, le texte
  affiché est réécrit par Postgres). Le repointage textuel n'est donc
  nécessaire que pour les corps de fonctions `language sql` / `plpgsql`
  (stockés en texte, résolus à l'exécution via `search_path`) : c'est là que
  `public.get_page_level(` doit devenir `private.get_page_level(`.

## Fichier(s) impacté(s)

- `supabase/private_schema_aides.sql` (nouveau, généré + rédigé)
- Miroirs à l'étape 5 (pas ici).

## Travail à réaliser

### 1. Schéma et privilèges

```sql
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
-- Aucun privilège par défaut : chaque fonction reçoit son grant explicite.
alter default privileges in schema private revoke execute on functions from public;
```

### 2. Déplacement des cinq aides

```sql
alter function public.is_admin() set schema private;
alter function public.get_user_role() set schema private;
alter function public.get_page_level(text) set schema private;
alter function public.page_level_rank(text) set schema private;
alter function public.repjour_manual_forecast_allowed(integer, integer) set schema private;
-- search_path figé sur les cinq (page_level_rank ne l'a pas dans son fichier)
alter function private.page_level_rank(text) set search_path = public;
-- Corps de get_page_level : `public.is_admin()` → `private.is_admin()`
create or replace function private.get_page_level(p_page text) … (corps à jour)
grant execute on function private.is_admin(), private.get_user_role(),
  private.get_page_level(text), private.page_level_rank(text),
  private.repjour_manual_forecast_allowed(integer, integer) to authenticated;
revoke execute on function … from public, anon;
```

Vérifier avant : `select count(*) from pg_proc p join pg_namespace n …
where n.nspname='public' and p.proname in (…)` = 5 exactement (pas de
surcharge).

### 3. Corps des fonctions et triggers (texte)

Générateur (scratchpad, node) : pour chaque fonction de `public` dont
`pg_get_functiondef` contient `public.(get_page_level|is_admin|get_user_role|page_level_rank|repjour_manual_forecast_allowed)\(` ou l'appel nu, émettre le `create or replace function` complet avec la substitution
`public.X(` → `private.X(` et `(?<![\w.])X(` → `private.X(`. Concerne 39
fonctions + 2 triggers (liste exacte tirée du catalogue au moment de la
génération). Les fonctions déplacées à l'étape 3 seront régénérées de
nouveau ; ce n'est pas un problème (idempotent).

### 4. Policies (texte, par sécurité)

Les policies référencent par OID et fonctionneront sans rien faire ; mais
`pg_get_expr` affichera déjà `private.get_page_level(...)`. Pour que les
fichiers d'autorité (étape 5) et `verif_*.sql` restent lisibles, AUCUNE
recréation de policy n'est faite ici (zéro risque de revert M2). Le contrôle
de l'étape 4 lit `pg_policies` et vérifie que `qual`/`with_check` ne
contiennent plus `public.get_page_level(`.

### 5. Essai à blanc et application

Comme le 2026-09-05 : `begin; … ; select …contrôles… ; rollback;` puis
application réelle, puis `verif_complet.sql` (attendu 20/20 : il compte des
policies par nom et fenêtre, pas par texte de fonction ; vérifier le
contrôle 18 « trigger protect_role_escalation » qui n'est pas concerné).

## Ordre d'exécution

1. Génération du fichier, relecture complète.
2. Commit.
3. Essai à blanc, application, contrôles.
4. Preuves par rôle en transaction annulée : lecture `parking_reservations`
   par un compte `lecture` (lignes visibles), par un compte sans droit (0
   ligne), écriture future par `ecriture` (acceptée), écriture passée
   (refusée), `insert profiles` par un non-admin avec `role='admin'`
   (refusée : `is_admin` toujours effectif), `select private.get_page_level('parking')`
   par `authenticated` (fonctionne, nécessaire aux policies), et
   `/rest/v1/rpc/get_page_level` inexistant (404 attendu, via curl anon).

## Critère de validation

- `select count(*) from pg_proc join pg_namespace … where nspname='public'
  and proname in (5 aides)` = 0 ; dans `private` = 5.
- `verif_complet.sql` 20/20, `verif_perf.sql` 10/10 (adapter son contrôle 3
  qui cherche `get_page_level`/`is_admin` dans `public` → `private`).
- Preuves par rôle identiques à avant.
- Connexion et navigation sur toutes les pages en dev : aucune erreur
  `function … does not exist`.

## Contrôle qualité (revue)

Étape critique (fondation de tout le modèle de droits, `alter function …
set schema`). `/borg` n'étant pas installé, revue manuelle ciblée : (1) les
cinq déplacements portent sur des signatures exactes, aucune surcharge
oubliée ; (2) toutes les fonctions régénérées ont encore `security
definer` / `stable` / `set search_path` identiques à avant (comparer
`proconfig`, `prosecdef`, `provolatile` avant/après) ; (3) aucun
`drop policy` dans le fichier ; (4) `private` absent des schémas exposés
(question 3 de l'index).

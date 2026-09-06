# Étape 2 — Script performance

## Objectif

Un script `supabase/perf_audit_2026-09-06.sql` qui rend la purge des noms
quasi gratuite (index partiel), précalcule le `code` PDJ (colonne générée +
index, vue `pdj_daily_agg` réécrite sur la colonne), fournit la RPC de boot
`get_my_access()` et pose le garde-fou `idle_in_transaction_session_timeout`.

## Contexte

- Purge : 1 906 appels × 152 ms pour 96 lignes avec `guest_name` non nul et
  0 ligne réellement à purger. Index partiel
  `(service_date) where guest_name is not null` → prédicat immédiat.
- `pdj_daily_agg` : le `CASE` (upper/coalesce/like) est immutable → colonne
  `code text generated always as (…) stored`. La vue garde la même liste de
  colonnes (`create or replace view` autorisé). Au passage, les grants par
  défaut `anon`/`authenticated` ALL sur la vue sont réduits à
  `select` pour `authenticated`.
- Vue matérialisée écartée : elle ignorerait la RLS (régression).
- RPC boot : `profiles` et `user_page_permissions` ont déjà des policies self
  → fonction `security invoker` dans `public`, pas de definer.
- `track_io_timing` / `log_min_duration_statement` : contexte superuser,
  impossible en SQL depuis `postgres` → dashboard (documenté pour
  l'utilisateur). `pg_stat_statements_reset()` : tenté, repli dashboard.

## Fichier(s) impacté(s)

- `supabase/perf_audit_2026-09-06.sql` (nouveau)
- `supabase/pdj_daily_agg.sql` (modifié : en-tête REMPLACÉ)
- `supabase/pdj_breakfasts.sql` (modifié : note colonne `code`)
- `supabase/verif_perf.sql` (modifié : contrôles ajoutés)

## Travail à réaliser

### 1. Index partiel purge

```sql
create index if not exists pdj_breakfasts_guest_name_pending_idx
  on public.pdj_breakfasts (service_date) where guest_name is not null;
```

### 2. Colonne générée `code` + index + vue

Expression identique au `CASE` actuel de la vue (extraite par
`pg_get_viewdef`), puis `create or replace view public.pdj_daily_agg` lisant
`code` directement ; `revoke all on public.pdj_daily_agg from anon, authenticated;
grant select … to authenticated`.

### 3. RPC `get_my_access()`

```sql
create or replace function public.get_my_access()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'permissions', coalesce((select jsonb_agg(jsonb_build_object('page', page, 'level', level))
                             from public.user_page_permissions where user_id = auth.uid()), '[]'::jsonb))
$$;
revoke execute on function public.get_my_access() from public, anon;
grant execute on function public.get_my_access() to authenticated;
```

### 4. Réglages

`alter role authenticated set idle_in_transaction_session_timeout = '60s'`,
idem `anon`, `authenticator`, `postgres`. Tentative
`select pg_stat_statements_reset()` en fin de script (erreur tolérée).

## Ordre d'exécution

1. `explain (analyze, buffers)` de `pdj_daily_agg` août 2026 avant.
2. Écrire, commiter, essai à blanc, appliquer.
3. `explain` après ; preuve par rôle : `get_my_access()` sous un compte non
   admin renvoie son profil et ses droits, sous un compte sans droit renvoie
   `permissions = []` (pas `null`).

## Critère de validation

- Index partiel présent, colonne `code` présente, vue lit `code`.
- `verif_perf.sql` tout OK.
- `pdj_daily_agg` août : buffers et temps inférieurs à la mesure avant.

## Contrôle qualité (revue)

Étape critique (ALTER TABLE, vue de prod, réglages de rôles). Revue manuelle :
(1) `select code, count(*) from pdj_breakfasts group by 1` identique au
`group by` de l'ancienne vue ; (2) la vue renvoie les mêmes lignes qu'avant
sur août 2026 (`except` vide dans les deux sens) ; (3) `has_table_privilege('anon','pdj_daily_agg','select')` = false.

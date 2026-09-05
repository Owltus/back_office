-- =============================================================================
-- perf_2026-09-05 — get_user_role STABLE + vue légère pdj_service_dates
--
-- Application : `supabase db query --linked -f supabase/perf_2026-09-05.sql`
-- (skill bob-assistant-supabase), fichier commité AVANT application.
-- Ré-exécutable (idempotent) : `alter function … stable` est sans effet s'il
-- est déjà posé, `create or replace view` remplace à l'identique.
--
-- INNOCUITÉ : aucune table, aucune donnée, aucune policy, aucun trigger touchés.
-- Aucun `drop`. Deux objets seulement :
--   (1) la fonction `get_user_role()` reçoit l'attribut STABLE ;
--   (2) une VUE nouvelle `pdj_service_dates` (lecture seule, security_invoker).
-- Rollback : `alter function public.get_user_role() volatile;` et
-- `drop view public.pdj_service_dates;`.
--
-- POURQUOI (panne du 2026-09-05, plan perf-resilience-2026-09-05, étape 7) :
--   (1) `get_user_role()` ne fait qu'un SELECT (voir security_core.sql) mais
--       était déclarée VOLATILE (défaut) : le planificateur la ré-évalue à
--       chaque ligne dans les policies `profiles` « Admin … » et ne peut pas
--       la sortir en InitPlan quand elle est enveloppée en `(select …)`.
--       STABLE est la déclaration correcte pour une fonction de lecture ;
--       sécurité inchangée (security definer + search_path figé conservés).
--   (2) `fetchServiceDates` (src/lib/pdj/service.ts) lisait la liste des dates
--       de service via `pdj_daily_agg?select=service_date` : EXPLAIN ANALYZE
--       sous rôle authenticated = 248 ms, Seq Scan de 12 787 lignes +
--       HashAggregate de 784 groupes, 930 appels depuis mars (la seule requête
--       applicative lourde mesurée). `select distinct service_date` sur la
--       table s'appuie sur l'index `pdj_breakfasts_service_date_idx` (Index
--       Only Scan) : quelques ms.
-- =============================================================================

-- (1) get_user_role : lecture seule → STABLE.
alter function public.get_user_role() stable;

-- (2) Dates de service DISTINCTES, sans agrégat.
-- security_invoker = true : la RLS de `pdj_breakfasts` (page:pdj lecture)
-- s'applique telle quelle ; un compte sans permission voit 0 ligne. Aucune
-- donnée nominative (une colonne date).
create or replace view public.pdj_service_dates
  with (security_invoker = true) as
  select distinct service_date
  from public.pdj_breakfasts;

grant select on public.pdj_service_dates to authenticated;
revoke all on public.pdj_service_dates from anon;

-- (3) OPTIONNEL, DÉSACTIVÉ : index simple sur parking_reservations.start_date.
-- Mesuré inutile le 2026-09-05 (528 lignes, fenêtre de 316 jours en 6 ms).
-- À activer si la table dépasse ~20 000 lignes.
-- create index if not exists parking_reservations_start_date_idx
--   on public.parking_reservations (start_date);

-- =============================================================================
-- VÉRIFICATION (lecture seule) — attendu : provolatile = 's', 1 vue,
-- reloptions contient security_invoker=true, anon absent des privilèges.
-- =============================================================================
select 'get_user_role' as objet, provolatile::text as valeur
from pg_proc
where pronamespace = 'public'::regnamespace and proname = 'get_user_role'
union all
select 'pdj_service_dates', coalesce(array_to_string(reloptions, ','), '(aucune option)')
from pg_class
where relnamespace = 'public'::regnamespace and relname = 'pdj_service_dates'
union all
select 'pdj_service_dates grants', string_agg(grantee || ':' || privilege_type, ', ')
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'pdj_service_dates';

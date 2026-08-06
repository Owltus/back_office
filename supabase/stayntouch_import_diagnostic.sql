-- =============================================================================
-- DIAGNOSTIC (LECTURE SEULE) — préalable à l'identité système « StayNTouch ».
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, puis COLLER le tableau
-- de résultat. Aucune écriture, aucun risque. UNE seule requête = 5 lignes de
-- réponse (le SQL Editor n'affiche que le dernier résultat, d'où le UNION).
--
-- On veut savoir : vers quoi pointe `imported_by` (profiles ? auth.users ?), s'il
-- est nullable, et si profiles.id est une FK vers auth.users. Les colonnes de
-- profiles sont déjà connues : id, email, display_name, role, first_name,
-- last_name (tous NOT NULL), created_at (nullable).
-- =============================================================================

with fk as (
  select tc.table_name, kcu.column_name,
         ccu.table_schema || '.' || ccu.table_name || '(' || ccu.column_name || ')' as ref
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
  where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
)
select 'daily_reports.imported_by nullable' as fact,
  coalesce((select is_nullable from information_schema.columns
    where table_schema='public' and table_name='daily_reports' and column_name='imported_by'),
    '(colonne absente)') as value
union all
select 'pms_daily_metrics.imported_by nullable',
  coalesce((select is_nullable from information_schema.columns
    where table_schema='public' and table_name='pms_daily_metrics' and column_name='imported_by'),
    '(colonne absente)')
union all
select 'daily_reports.imported_by -> FK',
  coalesce((select ref from fk where table_name='daily_reports' and column_name='imported_by' limit 1),
    '(aucune FK)')
union all
select 'pms_daily_metrics.imported_by -> FK',
  coalesce((select ref from fk where table_name='pms_daily_metrics' and column_name='imported_by' limit 1),
    '(aucune FK)')
union all
select 'profiles.id -> FK',
  coalesce((select ref from fk where table_name='profiles' and column_name='id' limit 1),
    '(aucune FK)');

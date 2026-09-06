-- =============================================================================
-- securite_audit_2026-09-06 — correctifs sécurité + hygiène de l'audit du
-- 2026-09-06 (plan/correctifs-audit-2026-09-06/1-sql-securite-hygiene.md)
--
-- Application : `supabase db query --linked -f supabase/securite_audit_2026-09-06.sql`
-- Idempotent. Une seule transaction (tout ou rien). Aucune donnée réécrite :
-- policies, fonctions trigger, contraintes, un index.
--
-- Décisions de l'utilisateur (2026-09-06) :
--   (1) facturation : retirer les 5 policies `… read (authenticated)` `using (true)`
--       (venues de page_permissions_rls_lectures_ROLLBACK.sql, rejoué par erreur :
--       tout compte connecté lisait émetteurs, codes, liste noire, documents
--       appris et lexique).
--   (2) triggers : plus aucune fonction `security definer` dans public.
--       affiche_stamp / parking_no_past_rewrite / prevent_self_role_change
--       passent `security invoker` (elles n'appellent que auth.uid() et des
--       aides `private` accordées à authenticated) ; log_delete DOIT rester
--       definer (audit_log n'a pas de policy INSERT) → déplacée dans private.
--       Toute fonction trigger de public/private : EXECUTE retiré à PUBLIC,
--       anon ET authenticated (un trigger n'est pas appelé via l'API ; la
--       boucle de lint_hardening_2026-09-05.sql excluait les triggers, d'où
--       8 fonctions restées `=X` PUBLIC).
--   (3) policies `to public` (6) : recréées `to authenticated`, appels
--       enveloppés `(select …)` (2 étaient nus). Aucun changement fonctionnel.
--   (4) daily_reports / pms_daily_metrics : INCHANGÉS (l'import est un upsert,
--       l'écriture doit pouvoir ré-importer).
--   (5) caisse_cautions UPDATE : fenêtre 30 jours pour l'écriture (rembourser
--       une caution prise la veille reste possible), gestion sans limite ;
--       DELETE inchangé (jour même).
--   (6) profiles.role : CHECK réduit à utilisateur/admin (0 super_utilisateur).
--   (7) user_page_permissions.page : CHECK sur les 8 clés de
--       src/lib/permissions/pages.ts (facturation incluse, sans ligne encore).
--   (8) FK d'auteur `on delete set null` : 3 existantes (NO ACTION → set null,
--       même cible) + 15 nouvelles vers public.profiles(id) ; NOT NULL levé sur
--       les 5 colonnes concernées (l'auteur est toujours estampillé à
--       l'insertion ; il ne devient vide qu'à la suppression du compte).
--       0 orphelin vérifié le 2026-09-06 sur les 18 colonnes.
--   (9) index doublon parking_tarifs_effective_from_idx retiré (le `_key`
--       unique couvre le tri par balayage arrière ; 3 lignes de tarifs).
-- =============================================================================

begin;

-- (1) Facturation ------------------------------------------------------------
drop policy if exists "issuers read (authenticated)"         on public.facturation_issuers;
drop policy if exists "issuer_codes read (authenticated)"    on public.facturation_issuer_codes;
drop policy if exists "issuer_denylist read (authenticated)" on public.facturation_issuer_denylist;
drop policy if exists "learned_docs read (authenticated)"    on public.facturation_learned_docs;
drop policy if exists "wordpool read (authenticated)"        on public.facturation_wordpool;

-- (2) Fonctions trigger ------------------------------------------------------
alter function public.affiche_stamp()            security invoker;
alter function public.parking_no_past_rewrite()  security invoker;
alter function public.prevent_self_role_change() security invoker;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'log_delete') then
    alter function public.log_delete() set schema private;
  end if;
end $$;

-- Corps de référence de private.log_delete (identique à la prod, dump
-- pg_get_functiondef du 2026-09-06 ; la fonction n'était versionnée nulle part) :
create or replace function private.log_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, old_data, performed_by)
  VALUES (TG_TABLE_NAME, OLD.id::TEXT, 'DELETE', to_jsonb(OLD), auth.uid());
  RETURN OLD;
END;
$function$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prorettype = 'pg_catalog.trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated;', r.sig);
  end loop;
end $$;

-- (3) Policies `to public` → `to authenticated` ------------------------------
drop policy if exists "Admin reads audit log" on public.audit_log;
create policy "Admin reads audit log" on public.audit_log
  for select to authenticated
  using ((select private.get_user_role()) = 'admin');

drop policy if exists "Admin reads all profiles" on public.profiles;
create policy "Admin reads all profiles" on public.profiles
  for select to authenticated
  using ((select private.get_user_role()) = 'admin');

drop policy if exists "Admin manages profiles" on public.profiles;
create policy "Admin manages profiles" on public.profiles
  for all to authenticated
  using ((select private.get_user_role()) = 'admin');

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "All read config" on public.hotel_config;
create policy "All read config" on public.hotel_config
  for select to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Admin updates config" on public.hotel_config;
create policy "Admin updates config" on public.hotel_config
  for update to authenticated
  using ((select private.get_user_role()) = 'admin');

-- (5) Cautions : UPDATE fenêtré 30 jours ------------------------------------
drop policy if exists "caisse cautions update (page:caisse)" on public.caisse_cautions;
create policy "caisse cautions update (page:caisse)" on public.caisse_cautions
  for update to authenticated
  using (
    (select private.get_page_level('caisse')) = 'gestion'
    or ((select private.page_level_rank(private.get_page_level('caisse'))) >= 2
        and taken_date >= current_date - 30)
  )
  with check (
    (select private.get_page_level('caisse')) = 'gestion'
    or ((select private.page_level_rank(private.get_page_level('caisse'))) >= 2
        and taken_date >= current_date - 30)
  );

-- (6) CHECK profiles.role ----------------------------------------------------
do $$
begin
  if exists (select 1 from public.profiles where role = 'super_utilisateur') then
    raise exception 'profiles : un compte porte encore super_utilisateur, CHECK non resserre';
  end if;
end $$;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('utilisateur', 'admin'));

-- (7) CHECK user_page_permissions.page --------------------------------------
alter table public.user_page_permissions drop constraint if exists user_page_permissions_page_check;
alter table public.user_page_permissions add constraint user_page_permissions_page_check
  check (page in ('repjour', 'pdj', 'parking', 'rapro', 'caisse', 'affichage', 'facturation', 'literie'));

-- (8) FK d'auteur ------------------------------------------------------------
-- 8a. Les 3 existantes : NO ACTION → set null, même cible.
alter table public.daily_reports drop constraint if exists daily_reports_imported_by_fkey;
alter table public.daily_reports add constraint daily_reports_imported_by_fkey
  foreign key (imported_by) references public.profiles(id) on delete set null;

alter table public.audit_log drop constraint if exists audit_log_performed_by_fkey;
alter table public.audit_log add constraint audit_log_performed_by_fkey
  foreign key (performed_by) references auth.users(id) on delete set null;

alter table public.caisse_cautions drop constraint if exists caisse_cautions_refunded_by_fkey;
alter table public.caisse_cautions add constraint caisse_cautions_refunded_by_fkey
  foreign key (refunded_by) references auth.users(id) on delete set null;

-- 8b. NOT NULL levé sur les 5 colonnes estampillées par trigger.
alter table public.baby_cot_assignments    alter column created_by drop not null;
alter table public.caisse_cautions         alter column created_by drop not null;
alter table public.caisse_sheets           alter column created_by drop not null;
alter table public.literie_sheets          alter column created_by drop not null;
alter table public.literie_stock_movements alter column created_by drop not null;

-- 8c. 15 nouvelles FK vers profiles(id), on delete set null.
do $$
declare
  c record;
  n_orphans bigint;
begin
  for c in
    select * from (values
      ('affiche_templates',      'created_by'),
      ('baby_cot_assignments',   'created_by'),
      ('caisse_cautions',        'created_by'),
      ('caisse_sheets',          'created_by'),
      ('caisse_sheets',          'validated_by'),
      ('caisse_sheets',          'countersigned_by'),
      ('hotel_rooms',            'updated_by'),
      ('literie_sheets',         'created_by'),
      ('literie_sheets',         'validated_by'),
      ('literie_stock_movements','created_by'),
      ('pms_daily_metrics',      'imported_by'),
      ('rapro_rooms',            'created_by'),
      ('rapro_sheets',           'created_by'),
      ('rapro_sheets',           'validated_by'),
      ('user_page_permissions',  'updated_by')
    ) as t(tbl, col)
  loop
    execute format('select count(*) from public.%I t where t.%I is not null and not exists (select 1 from public.profiles p where p.id = t.%I)',
                   c.tbl, c.col, c.col) into n_orphans;
    if n_orphans > 0 then
      raise exception 'FK auteur : % orphelin(s) sur %.%, script interrompu', n_orphans, c.tbl, c.col;
    end if;
    execute format('alter table public.%I drop constraint if exists %I', c.tbl, c.tbl || '_' || c.col || '_fkey');
    execute format('alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
                   c.tbl, c.tbl || '_' || c.col || '_fkey', c.col);
  end loop;
end $$;

-- (9) Index doublon ----------------------------------------------------------
drop index if exists public.parking_tarifs_effective_from_idx;

commit;

-- =============================================================================
-- VÉRIFICATION (lecture seule)
-- =============================================================================
select 'policies using(true) sur facturation' as controle, count(*)::text as valeur
from pg_policies where schemaname = 'public' and tablename like 'facturation%' and qual = 'true'
union all
select 'fonctions definer non-trigger dans public', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'pg_catalog.trigger'::regtype
union all
select 'fonctions trigger definer dans public', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.prorettype = 'pg_catalog.trigger'::regtype
union all
select 'fonctions trigger executables par anon/PUBLIC/authenticated', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private') and p.prorettype = 'pg_catalog.trigger'::regtype
  and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute')
       or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
union all
select 'triggers references (attendu 22)', count(*)::text
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal
union all
select 'policies to public dans public', count(*)::text
from pg_policies where schemaname = 'public' and roles::text = '{public}'
union all
select 'FK auteur on delete set null (attendu 18)', count(*)::text
from pg_constraint where contype = 'f' and confdeltype = 'n'
  and conname in ('daily_reports_imported_by_fkey','audit_log_performed_by_fkey','caisse_cautions_refunded_by_fkey',
    'affiche_templates_created_by_fkey','baby_cot_assignments_created_by_fkey','caisse_cautions_created_by_fkey',
    'caisse_sheets_created_by_fkey','caisse_sheets_validated_by_fkey','caisse_sheets_countersigned_by_fkey',
    'hotel_rooms_updated_by_fkey','literie_sheets_created_by_fkey','literie_sheets_validated_by_fkey',
    'literie_stock_movements_created_by_fkey','pms_daily_metrics_imported_by_fkey','rapro_rooms_created_by_fkey',
    'rapro_sheets_created_by_fkey','rapro_sheets_validated_by_fkey','user_page_permissions_updated_by_fkey')
union all
select 'CHECK profiles.role', pg_get_constraintdef(oid) from pg_constraint where conname = 'profiles_role_check'
union all
select 'CHECK user_page_permissions.page present', count(*)::text from pg_constraint where conname = 'user_page_permissions_page_check'
union all
select 'index parking_tarifs_effective_from_idx (attendu 0)', count(*)::text from pg_indexes where indexname = 'parking_tarifs_effective_from_idx';

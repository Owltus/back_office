-- =============================================================================
-- securite_blindage_2026-09-06 — passe « blindage » (red team du 2026-09-06)
--
-- Application : `supabase db query --linked -f supabase/securite_blindage_2026-09-06.sql`
-- Idempotent, une transaction. Aucune donnée réécrite. Aucun changement
-- fonctionnel pour l'application (vérifié : l'app ne lit jamais PostgREST sous
-- le rôle anon ; tout passe par une session authenticated).
--
-- (1) PRIVILÈGES PAR DÉFAUT : Supabase accorde ALL (dont TRUNCATE, qui n'est PAS
--     soumis à la RLS) à anon ET authenticated sur toute table créée dans
--     public. anon n'a aucune policy (RLS = 0 ligne) mais garde ces privilèges
--     latents ; authenticated garde TRUNCATE/REFERENCES/TRIGGER. On retire :
--       - TOUT à anon sur tables, vues, séquences de public (+ défauts futurs) ;
--       - TRUNCATE, REFERENCES, TRIGGER à authenticated sur toutes les tables
--         (+ défauts futurs) ; SELECT/INSERT/UPDATE/DELETE restent gouvernés
--         par la RLS comme aujourd'hui.
--     audit_log : append-only réel — authenticated n'écrit JAMAIS directement
--     (les écrivains sont des fonctions security definer dans private).
-- (2) daily_reports.imported_by : estampillé serveur (auth.uid()) comme les
--     autres tables ; un compte écriture ne peut plus signer un import du nom
--     d'un collègue. Contexte système (Edge import, auth.uid() nul) : inchangé.
-- (3) JOURNALISATION MINIMALE des droits et comptes (audit red team, M4) :
--     une fonction trigger generique dans private + 2 triggers
--     (user_page_permissions : tout ; profiles : création, rôle, suppression).
--     Réutilise les actions INSERT/UPDATE/DELETE déjà admises par le CHECK.
-- =============================================================================

begin;

-- (1) Privilèges ---------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.audit_log from authenticated;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;
do $$
begin
  alter default privileges for role supabase_admin in schema public revoke all on tables from anon;
  alter default privileges for role supabase_admin in schema public revoke all on sequences from anon;
  alter default privileges for role supabase_admin in schema public revoke truncate, references, trigger on tables from authenticated;
exception when others then
  raise notice 'defauts supabase_admin non modifiables : %', sqlerrm;
end $$;

-- (2) daily_reports : auteur estampillé -----------------------------------------
create or replace function public.daily_reports_stamp()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Utilisateur de l'app : l'auteur est TOUJOURS la session courante.
  -- Contexte système (Edge import-report, service_role) : valeur laissée telle quelle.
  if auth.uid() is not null then
    new.imported_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke execute on function public.daily_reports_stamp() from public, anon, authenticated;
drop trigger if exists daily_reports_stamp on public.daily_reports;
create trigger daily_reports_stamp
  before insert or update on public.daily_reports
  for each row execute function public.daily_reports_stamp();

-- (3) Journalisation droits + comptes ------------------------------------------
create or replace function private.log_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid text;
begin
  if tg_table_name = 'user_page_permissions' then
    rid := coalesce(new.user_id, old.user_id)::text || ':' || coalesce(new.page, old.page);
  else
    rid := coalesce(new.id, old.id)::text;
  end if;
  insert into public.audit_log (table_name, record_id, action, old_data, performed_by, performed_at)
  values (
    tg_table_name,
    rid,
    tg_op,
    case tg_op
      when 'INSERT' then to_jsonb(new)
      when 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
      else to_jsonb(old)
    end,
    auth.uid(),
    now()
  );
  return coalesce(new, old);
end;
$$;
revoke execute on function private.log_row_change() from public, anon, authenticated;

drop trigger if exists audit_user_page_permissions on public.user_page_permissions;
create trigger audit_user_page_permissions
  after insert or update or delete on public.user_page_permissions
  for each row execute function private.log_row_change();

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
  after insert or update of role or delete on public.profiles
  for each row execute function private.log_row_change();

commit;

-- =============================================================================
-- VÉRIFICATION (lecture seule)
-- =============================================================================
select 'privileges anon sur public (attendu 0)' as controle, count(*)::text as valeur
from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'
union all
select 'TRUNCATE/REFERENCES/TRIGGER authenticated sur public (attendu 0)', count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')
union all
select 'audit_log : privileges authenticated (attendu SELECT)', coalesce(string_agg(privilege_type, ','), '(aucun)')
from information_schema.role_table_grants where table_schema = 'public' and table_name = 'audit_log' and grantee = 'authenticated'
union all
select 'trigger daily_reports_stamp', count(*)::text from pg_trigger where tgname = 'daily_reports_stamp'
union all
select 'triggers de journalisation (attendu 2)', count(*)::text
from pg_trigger where tgname in ('audit_user_page_permissions','audit_profiles')
union all
select 'log_row_change dans private, definer', (select (n.nspname = 'private' and p.prosecdef)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname = 'log_row_change');

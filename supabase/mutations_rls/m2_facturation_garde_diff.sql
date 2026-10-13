-- MUTATION M2 (base LOCALE, transaction annulée) : la garde de
-- `private.facturation_issuer_learn` repasse de `is distinct from 'gestion'`
-- à `<> 'gestion'` (faille du 2026-09-05 : NULL passe). Attendu :
-- 02_rpc_privilegiees ÉCHOUE (aucun, reception, sans_profil passent la garde).
-- Lancer : psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -q -At -f supabase/mutations_rls/m2_facturation_garde_diff.sql
begin;
create or replace function private.facturation_issuer_learn(p_name text, p_display text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_name, '')) < 4 then
    return;
  end if;
  insert into public.facturation_issuers (name, display, count)
  values (p_name, p_display, 1)
  on conflict (name)
  do update set count = facturation_issuers.count + 1,
                display = excluded.display,
                updated_at = now();
end;
$function$;
\i supabase/tests/02_rpc_privilegiees.test.sql

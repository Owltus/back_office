-- =============================================================================
-- set_user_grade_garde_null_2026-09-28.sql — grade NULL refusé
--
-- Symptôme (revue du 2026-09-28) : `p_grade not in ('admin','utilisateur')`
--   vaut NULL pour p_grade = NULL : la garde est sautée, puis
--   `p_grade <> 'admin'` vaut NULL aussi, donc la garde « dernier admin »
--   est sautée à son tour, et `role` passe à NULL (le CHECK de
--   profiles.role laisse passer NULL). Seul un admin peut appeler la
--   fonction, mais il pouvait ainsi retirer le rôle du DERNIER admin.
-- Correctif : `p_grade is null or …`. Corps sinon IDENTIQUE à
--   private_rpc_relais.sql (aligné le même jour).
-- Innocuité : remplacement d'une fonction, mêmes grants, aucune donnée.
-- Application : supabase db query --linked -f supabase/set_user_grade_garde_null_2026-09-28.sql
-- =============================================================================

begin;

CREATE OR REPLACE FUNCTION private.set_user_grade(p_user uuid, p_grade text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  -- 2026-09-28 (set_user_grade_garde_null_2026-09-28.sql) : NULL-sûr ;
  -- `NULL not in (…)` sautait cette garde ET celle du dernier admin.
  if p_grade is null or p_grade not in ('admin', 'utilisateur') then
    raise exception 'invalid grade: %', p_grade;
  end if;
  if p_grade <> 'admin'
     and exists (select 1 from public.profiles where id = p_user and role = 'admin')
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'dernier admin: rétrogradation refusée (verrouillage total)';
  end if;
  insert into public.audit_log (table_name, record_id, action, old_data, performed_by, performed_at)
  values (
    'profiles', p_user::text, 'set_user_grade',
    jsonb_build_object(
      'old_role', (select role from public.profiles where id = p_user),
      'new_grade', p_grade
    ),
    auth.uid(), now()
  );
  update public.profiles set role = p_grade where id = p_user;
end;
$function$
;
revoke execute on function private.set_user_grade(uuid,text) from public, anon;
grant execute on function private.set_user_grade(uuid,text) to authenticated;

commit;

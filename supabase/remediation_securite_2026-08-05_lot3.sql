-- =============================================================================
-- REMÉDIATION SÉCURITÉ — pentest #2, LOT 3 : journalisation audit_log (A2/A4)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, EN UNE FOIS.
-- SÛR / idempotent (create or replace ; aucune donnée touchée).
--
-- Ajoute la TRAÇABILITÉ des opérations admin sensibles dans audit_log (schéma :
-- table_name, record_id, action, old_data, performed_by, performed_at ; id auto) :
--   A2 — admin_update_password journalise chaque reset (JAMAIS le mot de passe).
--   A4 — set_user_grade journalise chaque changement de grade (ancien → nouveau).
-- Redéfinit les 2 fonctions AVEC leurs gardes du lot 1 (cible admin / dernier admin).
-- =============================================================================

-- A2 — admin_update_password (garde inter-admin + journalisation) ---------------
create or replace function public.admin_update_password(target_user_id uuid, new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $function$
begin
  if (select role from public.profiles where id = auth.uid()) <> 'admin' then
    raise exception 'Accès refusé : rôle admin requis';
  end if;
  if target_user_id <> auth.uid()
     and (select role from public.profiles where id = target_user_id) = 'admin' then
    raise exception 'Cible administrateur : réinitialisation interdite (passer par le dashboard)';
  end if;
  if length(new_password) < 12 then
    raise exception 'Le mot de passe doit faire au moins 12 caractères';
  end if;
  if new_password !~ '[A-Z]' then
    raise exception 'Le mot de passe doit contenir au moins une majuscule';
  end if;
  if new_password !~ '[a-z]' then
    raise exception 'Le mot de passe doit contenir au moins une minuscule';
  end if;
  if new_password !~ '[0-9]' then
    raise exception 'Le mot de passe doit contenir au moins un chiffre';
  end if;
  if new_password !~ '[^a-zA-Z0-9]' then
    raise exception 'Le mot de passe doit contenir au moins un caractère spécial';
  end if;
  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf'))
  where id = target_user_id;
  insert into public.audit_log (table_name, record_id, action, old_data, performed_by, performed_at)
  values (
    'auth.users', target_user_id::text, 'admin_password_reset',
    jsonb_build_object('target_role', (select role from public.profiles where id = target_user_id)),
    auth.uid(), now()
  );
end;
$function$;

-- A4 — set_user_grade (garde dernier admin + journalisation) --------------------
create or replace function public.set_user_grade(p_user uuid, p_grade text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_grade not in ('admin', 'utilisateur') then
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
$$;

-- Vérification (lecture seule) : les 2 fonctions référencent bien audit_log.
--   select p.proname,
--          pg_get_functiondef(p.oid) like '%insert into public.audit_log%' as journalise
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public' and p.proname in ('admin_update_password','set_user_grade');

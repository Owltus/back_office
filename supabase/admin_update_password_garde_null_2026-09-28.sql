-- =============================================================================
-- admin_update_password_garde_null_2026-09-28.sql — garde admin étanche au NULL
--
-- Symptôme (revue de code du 2026-09-28) : la garde de
--   private.admin_update_password était `(select role … ) <> 'admin'`. Un
--   appelant AUTHENTIFIÉ mais SANS ligne `profiles` obtient NULL, la
--   condition vaut NULL, le `raise` est sauté : il peut changer le mot de
--   passe de n'importe quel compte non admin (compte Réception compris).
-- Qui est dans ce cas : un compte dont le profil a été supprimé mais dont
--   le jeton reste valide (repli « banni » de delete-user, jusqu'à 1 h ; ou
--   bannissement échoué), un compte orphelin d'une création annulée.
--   (Un compte supprimé de auth.users échoue sur la FK de audit_log.)
-- Correctif : `if not private.is_admin()` (déjà coalesce(…, false)), comme
--   set_user_grade / set_page_permission. Corps sinon IDENTIQUE à
--   private_rpc_relais.sql (généré du catalogue le 2026-09-05).
-- Innocuité : remplacement d'une fonction, mêmes grants. Aucune donnée.
-- Application : supabase db query --linked -f supabase/admin_update_password_garde_null_2026-09-28.sql
-- Vérification : voir le bloc en fin de fichier (transaction annulée).
-- =============================================================================

begin;

CREATE OR REPLACE FUNCTION private.admin_update_password(target_user_id uuid, new_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  -- 2026-09-28 : `is_admin()` (coalesce → false) et non plus `<> 'admin'`,
  -- qui laissait passer un appelant SANS profil (NULL <> 'admin' = NULL).
  if not private.is_admin() then
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
$function$
;
revoke execute on function private.admin_update_password(uuid,text) from public, anon;
grant execute on function private.admin_update_password(uuid,text) to authenticated;

commit;

-- Vérification (annulée) : un JWT dont le `sub` n'a pas de profil doit être
-- refusé AVANT toute écriture. À lancer seul, après application.
-- do $$
-- begin
--   perform set_config('role', 'authenticated', true);
--   perform set_config('request.jwt.claims',
--     '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
--   begin
--     perform public.admin_update_password(
--       (select id from public.profiles where role <> 'admin' limit 1), 'Xx1!aaaaaaaaaa');
--     raise exception 'RESULTAT ECART : appelant sans profil accepté';
--   exception when others then
--     if sqlerrm like 'RESULTAT%' then raise; end if;
--     raise exception 'RESULTAT OK : refusé (%)', sqlerrm;
--   end;
-- end $$;

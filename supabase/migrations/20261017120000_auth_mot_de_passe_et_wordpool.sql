-- 2026-10-17 — Correctifs d'audit, lot authentification (base).
--
-- 1. private.admin_update_password
--    Symptôme : un mot de passe NULL passait toutes les gardes (length(NULL) < 12
--    et NULL !~ '…' valent NULL, donc aucun `if` ne se déclenche) puis
--    `crypt(NULL, …)` = NULL VIDAIT `encrypted_password` de la cible (compte
--    inutilisable par mot de passe). Et une réinitialisation laissait vivantes
--    les sessions ouvertes de la cible : un poste compromis gardait son accès
--    (jeton de renouvellement toujours valable).
--    Correctif : refus explicite de NULL (cible et mot de passe), puis
--    `delete from auth.sessions where user_id = target_user_id` (les refresh
--    tokens sont supprimés en cascade : un renouvellement échoue ensuite).
--    Définition reprise de pg_get_functiondef (catalogue local = baseline),
--    journalisation audit_log inchangée.
--
-- 2. private.facturation_wordpool_prune
--    Symptôme : des paramètres aberrants (p_top_k <= 0, ex. (-1, -1)) vidaient
--    TOUTE la table facturation_wordpool (rn > -1 est vrai pour chaque ligne).
--    Correctif : p_min_count et p_top_k doivent être non NULL et >= 1
--    (erreur 22023 sinon). L'appel de l'app (2, 300 par défaut) est inchangé.
--
-- Innocuité : `create or replace` de deux fonctions, mêmes signatures, même
-- propriétaire et mêmes droits (create or replace les conserve) ; aucune
-- écriture de contenu dans la migration.

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
  -- 2026-10-17 : NULL passait toutes les gardes ci-dessous et vidait
  -- encrypted_password (crypt(NULL, …) = NULL).
  if target_user_id is null then
    raise exception 'Compte cible manquant' using errcode = '22004';
  end if;
  if new_password is null then
    raise exception 'Le mot de passe est obligatoire' using errcode = '22004';
  end if;
  if target_user_id is distinct from auth.uid()
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
  -- 2026-10-17 : un nouveau mot de passe coupe les sessions ouvertes de la
  -- cible (refresh tokens supprimés en cascade) — sinon un poste qui avait
  -- l'ancien gardait son accès.
  delete from auth.sessions where user_id = target_user_id;
  insert into public.audit_log (table_name, record_id, action, old_data, performed_by, performed_at)
  values (
    'auth.users', target_user_id::text, 'admin_password_reset',
    jsonb_build_object('target_role', (select role from public.profiles where id = target_user_id)),
    auth.uid(), now()
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.facturation_wordpool_prune(p_min_count integer DEFAULT 2, p_top_k integer DEFAULT 300)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  -- 2026-10-17 : (-1, -1) ou un top_k <= 0 vidait toute la table.
  if p_min_count is null or p_min_count < 1 or p_top_k is null or p_top_k < 1 then
    raise exception 'Paramètres d''élagage invalides (min_count et top_k doivent valoir au moins 1)'
      using errcode = '22023';
  end if;

  delete from public.facturation_wordpool where count < p_min_count;

  delete from public.facturation_wordpool w
  using (
    select code, token,
           row_number() over (partition by code order by count desc) as rn
    from public.facturation_wordpool
  ) r
  where w.code = r.code and w.token = r.token and r.rn > p_top_k;
end;
$function$;

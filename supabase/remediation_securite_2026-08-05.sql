-- =============================================================================
-- REMÉDIATION SÉCURITÉ — pentest #2 du 2026-08-05 (script consolidé UNIQUE)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, EN UNE FOIS.
-- Vérification séparée : `verif_securite_2026-08-05.sql`.
--
-- Couvre (lot confirmé & sûr) :
--   A3 — caisse_stamp fige `countersigned_by` (anti-forge de contre-signature)
--   A2 — admin_update_password refuse de cibler un AUTRE admin
--   A4 — set_user_grade : garde « dernier admin » reversée (dérive repo corrigée)
--   B7 — rapro_rooms : contrainte CHECK `status` unique à 5 valeurs (rejeu sûr)
--
-- NON couvert ici (volontairement, passes dédiées) :
--   A1 (idempotence apprentissage facturation) : refactor RPC + client, à part.
--   A5 (rémanence nettoyee rapro) : logique métier, à part.
--   Journalisation audit_log de A2/A4 : nécessite le schéma exact d'audit_log
--     (table héritée non versionnée) — à ajouter une fois le schéma confirmé.
--   B2 (figer email dans profiles) : dépend du schéma profiles et du comportement
--     de /profil (édition d'email ?) — à confirmer avant de figer.
--
-- SÛR EN PRODUCTION : idempotent, transactionnel, additif. Aucun DROP de donnée.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- A3 — caisse_stamp fige countersigned_by
-- -----------------------------------------------------------------------------
-- Le trigger estampille created_by/validated_by/validated_at côté serveur mais
-- n'a jamais couvert `countersigned_by` → un compte caisse:ecriture pouvait
-- forger la contre-signature d'un tiers par écriture directe (PostgREST). On la
-- fige : jamais acceptée du client (null à la création, préservée à l'update).
create or replace function public.caisse_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.countersigned_by := null;                     -- jamais posée à la création
    if new.status = 'validated' then
      new.validated_at := now();
      new.validated_by := auth.uid();
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  else -- UPDATE
    new.created_by := old.created_by;
    new.countersigned_by := old.countersigned_by;     -- non réécrivable par le client
    if new.status = 'validated' then
      if old.status is distinct from 'validated' then
        new.validated_at := now();
        new.validated_by := auth.uid();
      else
        new.validated_at := old.validated_at;
        new.validated_by := old.validated_by;
      end if;
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- A2 — admin_update_password refuse de cibler un AUTRE admin
-- -----------------------------------------------------------------------------
-- Symétrie avec delete-user (qui protège déjà les admins). Empêche un admin de
-- réinitialiser le mot de passe d'un autre admin (prise de contrôle latérale).
-- La réinitialisation de son PROPRE mot de passe reste permise.
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
  -- Anti-takeover inter-admin : refuser une cible admin autre que soi-même.
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
end;
$function$;

-- -----------------------------------------------------------------------------
-- A4 — set_user_grade : garde « dernier admin » (reversée dans le dépôt)
-- -----------------------------------------------------------------------------
-- La garde vivait en base (remédiation 2026-08-04) mais pas dans le repo → dérive.
-- On la réaffirme ici ET dans page_permissions.sql. Refuse de rétrograder le
-- SEUL admin restant (verrouillage total de l'administration).
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
  update public.profiles set role = p_grade where id = p_user;
end;
$$;

-- -----------------------------------------------------------------------------
-- B7 — rapro_rooms : contrainte CHECK status unique à 5 valeurs
-- -----------------------------------------------------------------------------
-- Les migrations status (rattrapage, non_vendue) réécrivaient toute la liste ;
-- un rejeu dans le désordre retirait une valeur → écriture en échec silencieux.
-- On pose une fois la contrainte finale (idempotente), rejouable sans risque.
alter table public.rapro_rooms
  drop constraint if exists rapro_rooms_status_check;
alter table public.rapro_rooms
  add constraint rapro_rooms_status_check
  check (
    status is null
    or status in ('nettoyee', 'non_nettoyee', 'refus', 'rattrapage', 'non_vendue')
  );

commit;

-- Fin. Lancer ensuite `verif_securite_2026-08-05.sql`.

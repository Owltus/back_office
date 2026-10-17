-- =====================================================================
-- RÈGLES D'ÉCRITURE — quatre trous de policies refermés, 2026-10-17
-- =====================================================================
-- Audit du 2026-10-17 (lot « règles d'écriture »). Quatre défauts confirmés
-- par essai sous `authenticated` sur la base locale.
--
-- 1. PDJ — plafond des inclus contourné.
--    Symptôme : un compte `ecriture` (pdj) passe `manual_kind` d'une ligne
--    IMPORTÉE de NULL à 'extra', puis la supprime (la policy DELETE n'exige
--    que `manual_kind is not null`), ou y pose un `breakfasts_included`
--    libre (le trigger `pdj_clamp_breakfasts_included` ne recalcule pas une
--    ligne manuelle) : le plafond de 2 saute.
--    Cause : rien ne protège la colonne `manual_kind` d'une ligne existante.
--    Correctif : trigger `pdj_breakfasts_manual_kind_fige` — hors gestion,
--    une ligne importée (manual_kind NULL) ne devient pas manuelle (42501).
--    Innocuité : l'app ne pose `manual_kind` que sur une chambre VIDE ou déjà
--    manuelle (`GuestRow.canManual = !row || isManual`, upsert de
--    `setManualServe`) ; passer d'un type manuel à un autre (inclus → extra)
--    et l'import qui écrase une ligne manuelle (valeur → NULL, le plafond se
--    recalcule) restent permis. L'import nocturne (clé serveur, auth.uid()
--    NULL) et la gestion ne sont pas concernés.
--
-- 2. Lits bébé — début d'un prêt reculé hors fenêtre.
--    Symptôme : un compte `ecriture` (literie) recule `start_date` d'un prêt
--    encore ouvert loin dans le passé ; le WITH CHECK de la policy UPDATE ne
--    porte que sur `end_date`.
--    Correctif : trigger `baby_cot_assignments_no_past_rewrite`, calqué sur
--    `parking_no_past_rewrite` : hors gestion, un début ne recule pas sous
--    current_date - 2 (fenêtre LITERIE_GRACE_DAYS de la policy INSERT), 42501.
--    Innocuité : un début avancé, ou reculé dans la fenêtre, reste permis ;
--    l'app applique désormais la même garde avant d'écrire (editability.ts).
--
-- 3. hotel_rooms — renumérotation d'une chambre.
--    Symptôme : la policy UPDATE (rang >= 2 literie) laisse réécrire `room`,
--    clé de la table (une chambre disparaît, une autre apparaît).
--    Correctif : trigger `hotel_rooms_room_fige` : `room` est figée pour tout
--    utilisateur de l'app (42501) ; seul un contexte système (auth.uid()
--    NULL : migration, maintenance) peut la changer.
--    Innocuité : l'app ne met à jour que `literie_synthetique`
--    (lib/literie/service.ts) ; l'estampillage `hotel_rooms_stamp` est
--    inchangé.
--
-- 4. profiles — un compte révoqué se recrée un profil.
--    Symptôme : la policy « profiles insert (bornee) » laisse un compte SANS
--    profil (banni, supprimé de `profiles`, jeton encore valide) insérer sa
--    propre ligne avec n'importe quel e-mail : il réapparaît comme utilisateur.
--    Correctif : insertion réservée à `private.is_admin()`.
--    Innocuité : le seul insert de l'app est celui de ComptesBoard (admin,
--    après l'Edge Function `create-user`, qui ne crée pas de profil) ; les
--    Edge Functions passent par la clé serveur (RLS contournée).
--
-- Additive : deux fonctions + trois triggers neufs, une policy remplacée
-- (même nom). Aucune donnée touchée.
-- =====================================================================

-- 1. PDJ : une ligne importée ne devient pas manuelle hors gestion ---------
create or replace function public.pdj_breakfasts_manual_kind_fige()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Contexte non-utilisateur (import nocturne, maintenance) : aucun garde-fou.
  if auth.uid() is null then
    return new;
  end if;
  -- La gestion (et l'admin, get_page_level = 'gestion') peut tout.
  if private.get_page_level('pdj') = 'gestion' then
    return new;
  end if;
  if old.manual_kind is null and new.manual_kind is not null then
    raise exception using
      errcode = '42501',
      message = 'pdj: une ligne importee ne devient pas manuelle (reserve a la gestion)';
  end if;
  return new;
end;
$$;

alter function public.pdj_breakfasts_manual_kind_fige() owner to postgres;
revoke all on function public.pdj_breakfasts_manual_kind_fige() from public;
grant all on function public.pdj_breakfasts_manual_kind_fige() to service_role;

create or replace trigger pdj_breakfasts_manual_kind_fige
  before update on public.pdj_breakfasts
  for each row execute function public.pdj_breakfasts_manual_kind_fige();

-- 2. Lits bébé : le début d'un prêt ne recule pas hors fenêtre ------------
create or replace function public.baby_cot_assignments_no_past_rewrite()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if private.get_page_level('literie') = 'gestion' then
    return new;
  end if;
  -- Même plancher que la policy INSERT (LITERIE_GRACE_DAYS = 2).
  if new.start_date < old.start_date and new.start_date < (current_date - 2) then
    raise exception using
      errcode = '42501',
      message = 'lits bebe: recul du debut hors fenetre (reserve a la gestion)';
  end if;
  return new;
end;
$$;

alter function public.baby_cot_assignments_no_past_rewrite() owner to postgres;
revoke all on function public.baby_cot_assignments_no_past_rewrite() from public;
grant all on function public.baby_cot_assignments_no_past_rewrite() to service_role;

create or replace trigger baby_cot_assignments_no_past_rewrite
  before update on public.baby_cot_assignments
  for each row execute function public.baby_cot_assignments_no_past_rewrite();

-- 3. hotel_rooms : le numéro de chambre est figé ---------------------------
create or replace function public.hotel_rooms_room_fige()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.uid() is not null and new.room is distinct from old.room then
    raise exception using
      errcode = '42501',
      message = 'hotel_rooms: le numero de chambre ne se modifie pas';
  end if;
  return new;
end;
$$;

alter function public.hotel_rooms_room_fige() owner to postgres;
revoke all on function public.hotel_rooms_room_fige() from public;
grant all on function public.hotel_rooms_room_fige() to service_role;

create or replace trigger hotel_rooms_room_fige
  before update on public.hotel_rooms
  for each row execute function public.hotel_rooms_room_fige();

-- 4. profiles : insertion réservée à l'admin -------------------------------
drop policy if exists "profiles insert (bornee)" on public.profiles;
create policy "profiles insert (bornee)" on public.profiles
  for insert to authenticated
  with check ((select private.is_admin()));

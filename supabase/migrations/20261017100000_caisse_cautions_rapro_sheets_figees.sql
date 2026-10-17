-- =====================================================================
-- Cautions de caisse et feuilles de rapprochement clôturées : figées en base
-- (audit du 2026-10-17, lot caisse / rapprochement)
-- =====================================================================
-- SYMPTÔMES (reproduits sur la base locale, transaction annulée) :
--   1. Un compte `ecriture` de la page caisse change `taken_date` d'une
--      caution de J-20 pour la date du jour, puis la SUPPRIME : la policy
--      DELETE n'autorise l'écriture que « le jour même de la prise », et la
--      policy UPDATE ne fige pas la date. Une caution ancienne disparaît
--      donc sans la gestion.
--   2. Sur une caution déjà remboursée qui le reste, le client réécrit
--      `refunded_by` et `refunded_at` (qui a remboursé, quand) : la trace,
--      posée par le serveur à la transition active -> refunded, n'est pas
--      gardée ensuite.
--   3. Aucune journalisation des cautions (argent du client) dans audit_log.
--   4. `rapro_sheets` en statut `validated` reste modifiable (comment,
--      operator_name, corrections, late_arrivals) et supprimable par un
--      compte `ecriture` (fenêtre J-2) : seul `rapro_rooms` était figé
--      (`private.rapro_jour_cloture_fige`). Supprimer la feuille rouvre
--      même la grille du jour sans passer par la réouverture.
--
-- CORRECTIF :
--   1-2. `public.caisse_cautions_stamp` (remplacée en place) : `taken_date`
--      ne change que pour la gestion de la page caisse ou un contexte
--      système (42501 sinon) ; une caution refunded qui reste refunded garde
--      `refunded_by` (`private.keep_author`) et `refunded_at`.
--   3. Trigger `audit_caisse_cautions` -> `private.log_row_change`, comme
--      profiles / user_page_permissions / classeur_acces.
--   4. `private.rapro_sheets_cloturee_figee`, modèle de
--      `private.caisse_cloturee_figee` : refus (42501) d'un UPDATE qui laisse
--      la feuille `validated` et change une colonne métier (tout sauf la
--      trace de validation et d'estampillage) — gestion comprise, comme la
--      caisse : on rouvre, on corrige, on reclôture. Refus d'un DELETE d'une
--      feuille `validated` hors gestion de la page rapro.
--
-- INNOCUITÉ :
--   - L'app ne modifie jamais `taken_date` (updateCaution : room, amount,
--     comment ; refund / reactivate : status, refunded_date) ; rembourser et
--     annuler un remboursement sont inchangés (transitions déjà gérées).
--   - Rapprochement : clôture = upsert validated sur un jour non clôturé
--     (permis) ; réouverture = passage à draft (permis : la nouvelle ligne
--     n'est plus validated) ; un upsert de clôture IDENTIQUE sur un jour
--     déjà clôturé passe (aucune colonne métier ne change). Le commentaire
--     n'est enregistré par l'app que sur un jour non clôturé
--     (`canEditFields` de RaproBoard). L'app ne supprime aucune feuille.
--   - Contexte système (`auth.uid()` null : service_role, import, SQL
--     d'administration) jamais bloqué, comme les triggers voisins.
--   - Aucune donnée réécrite, aucun objet retiré.
-- =====================================================================

-- 1-2. Cautions : date de prise et trace du remboursement figées ---------
create or replace function public.caisse_cautions_stamp() returns trigger
  language plpgsql
  set search_path to 'public'
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.refunded_by := null;
    new.refunded_at := null;
  elsif tg_op = 'UPDATE' then
    -- Date de prise : elle décide de la fenêtre de suppression (jour même)
    -- et de modification (30 j). Seule la gestion la corrige.
    if new.taken_date is distinct from old.taken_date
       and auth.uid() is not null
       and private.get_page_level('caisse') is distinct from 'gestion' then
      raise exception 'Date de prise d''une caution : réservée à la gestion.'
        using errcode = '42501';
    end if;
    new.created_by := private.keep_author(new.created_by, old.created_by);
    if new.status = 'refunded' and old.status = 'active' then
      new.refunded_by := auth.uid();
      new.refunded_at := now();
    elsif new.status = 'active' and old.status = 'refunded' then
      -- Retour à 'active' (annulation d'un remboursement saisi par erreur) :
      -- on efface proprement la trace du remboursement précédent.
      new.refunded_by := null;
      new.refunded_at := null;
    elsif new.status = 'refunded' and old.status = 'refunded' then
      -- Toujours remboursée : la trace posée par le serveur ne bouge plus.
      new.refunded_by := private.keep_author(new.refunded_by, old.refunded_by);
      new.refunded_at := old.refunded_at;
    end if;
  end if;
  return new;
end;
$$;

alter function public.caisse_cautions_stamp() owner to postgres;
revoke all on function public.caisse_cautions_stamp() from public;
grant all on function public.caisse_cautions_stamp() to service_role;

-- 3. Cautions : journal --------------------------------------------------
create or replace trigger audit_caisse_cautions
  after insert or delete or update on public.caisse_cautions
  for each row execute function private.log_row_change();

-- 4. Feuille de rapprochement clôturée : figée, suppression = gestion ----
create or replace function private.rapro_sheets_cloturee_figee() returns trigger
  language plpgsql
  set search_path to ''
as $$
declare
  trace constant text[] := array[
    'id', 'status', 'validated_at', 'validated_by',
    'created_by', 'created_at', 'updated_at'
  ];
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'validated'
       and private.get_page_level('rapro') is distinct from 'gestion' then
      raise exception 'Rapprochement clôturé : seule la gestion peut supprimer la feuille.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if old.status = 'validated' and new.status = 'validated'
     and (to_jsonb(new) - trace) is distinct from (to_jsonb(old) - trace) then
    raise exception 'Rapprochement clôturé : réouvrez le jour pour le modifier.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

alter function private.rapro_sheets_cloturee_figee() owner to postgres;
revoke all on function private.rapro_sheets_cloturee_figee() from public, anon, authenticated;
grant all on function private.rapro_sheets_cloturee_figee() to service_role;

create or replace trigger rapro_sheets_cloturee_figee
  before update or delete on public.rapro_sheets
  for each row execute function private.rapro_sheets_cloturee_figee();

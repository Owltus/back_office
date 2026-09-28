-- =============================================================================
-- FEUILLES CLÔTURÉES FIGÉES EN BASE — caisse + rapprochement (2026-09-28)
--
-- NON APPLIQUÉ. À exécuter par l'utilisateur (SQL Editor, ou
-- `supabase db query --linked -f` après commit). Ré-exécutable (create or
-- replace + drop trigger if exists). Aucune donnée touchée, aucune policy
-- modifiée : deux fonctions trigger dans `private` et deux triggers.
--
-- POURQUOI
--   Une feuille clôturée n'était figée QUE dans l'interface. La RLS borne la
--   FENÊTRE de jours (caisse J-1, rapro J-2) mais pas le STATUT : dans cette
--   fenêtre, un appel direct à l'API (ou un autosave en retard) pouvait modifier
--   une caisse clôturée ou les chambres d'un rapprochement clôturé sans la
--   réouvrir.
--
-- RÈGLES (erreur 42501, message court en français)
--   1. caisse_sheets, BEFORE UPDATE : si la feuille est 'validated' AVANT et
--      APRÈS la mise à jour, aucune colonne de DONNÉES ne peut changer.
--      Colonnes de données = toutes, sauf la trace (status, validated_at,
--      validated_by, countersigned_by, created_by, created_at, updated_at, id).
--      Comparaison par `to_jsonb(row) - clés de trace` : une colonne ajoutée
--      plus tard est protégée d'office.
--   2. rapro_rooms, BEFORE INSERT / UPDATE / DELETE : refus si le jour concerné
--      (ancien ET nouveau `report_date` pour un UPDATE) a une ligne
--      rapro_sheets en 'validated'. Pour un UPDATE, seules les colonnes de
--      données comptent (report_date, room, status, carried_manual,
--      materialized) : une mise à jour qui ne touche que l'auteur passe.
--
-- POURQUOI LE FLUX ACTUEL RESTE COMPATIBLE (vérifié dans le code)
--   Caisse (components/caisse/CaisseBoard.tsx, lib/caisse/service.ts) :
--     - clôture = upsertSheet(saisie) SUR LE BROUILLON, PUIS validateSheet
--       (update de `status` seul) : la donnée est écrite avant le passage en
--       'validated', et le passage lui-même ne change aucune donnée ;
--     - réouverture = update status 'draft' + validated_at/by à null : le
--       statut quitte 'validated', la règle 1 ne s'applique pas (et aucune
--       donnée ne change de toute façon) ;
--     - un upsert qui renvoie des valeurs IDENTIQUES sur une feuille clôturée
--       passe (rien ne change) ; l'autosave n'envoie de toute façon plus rien
--       sur une feuille clôturée (garde ajoutée dans `flush` le même jour).
--   Rapprochement (components/rapro/RaproBoard.tsx, lib/rapro/service.ts) :
--     - clôture = materializeCleaned (écrit rapro_rooms) PUIS validateSheet :
--       la matérialisation a lieu pendant que la feuille est encore 'draft' ;
--     - réouverture = reopenSheet (rapro_sheets → 'draft') PUIS
--       purgeMaterialized (écrit rapro_rooms) : la purge a lieu APRÈS la
--       réouverture ;
--     - toute saisie de chambre est déjà masquée à l'écran sur un jour clôturé.
--   Suppression d'un compte (FK d'auteur `on delete set null`, 2026-09-06) :
--     c'est un UPDATE qui ne change que created_by / validated_by /
--     countersigned_by — colonnes de trace, donc jamais refusé.
--   Contexte système (auth.uid() null : CLI, service_role, maintenance) :
--     aucune garde, comme `private.classeur_garde`.
--
-- SÉCURITÉ
--   Fonctions `security invoker` : elles ne lisent que des tables que
--   l'appelant a déjà le droit de lire (un rédacteur rapro lit rapro_sheets).
--   search_path vide, noms qualifiés, EXECUTE retiré à public/anon/authenticated
--   (un trigger s'exécute sans ce droit ; il ne sert qu'à l'appel direct).
-- =============================================================================

-- 1) CAISSE ------------------------------------------------------------------
-- Une seule transaction (contre-revue du 2026-09-28) : une erreur au milieu
-- ne doit pas laisser la caisse figée sans le rapprochement.
begin;

create or replace function private.caisse_cloturee_figee()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  trace constant text[] := array[
    'id', 'status', 'validated_at', 'validated_by', 'countersigned_by',
    'created_by', 'created_at', 'updated_at'
  ];
begin
  if auth.uid() is null then
    return new;
  end if;
  if old.status = 'validated' and new.status = 'validated'
     and (to_jsonb(new) - trace) is distinct from (to_jsonb(old) - trace) then
    raise exception 'Caisse clôturée : réouvrez-la pour la modifier.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.caisse_cloturee_figee() from public, anon, authenticated;

drop trigger if exists caisse_cloturee_figee on public.caisse_sheets;
create trigger caisse_cloturee_figee
  before update on public.caisse_sheets
  for each row execute function private.caisse_cloturee_figee();

-- 2) RAPPROCHEMENT -----------------------------------------------------------
create or replace function private.rapro_jour_cloture_fige()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  jours date[];
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    jours := array[new.report_date];
  elsif tg_op = 'DELETE' then
    jours := array[old.report_date];
  else
    -- UPDATE : seules les colonnes de données comptent (l'auteur peut être
    -- remis à null par la suppression d'un compte).
    if (new.report_date, new.room, new.status, new.carried_manual, new.materialized)
       is not distinct from
       (old.report_date, old.room, old.status, old.carried_manual, old.materialized) then
      return new;
    end if;
    jours := array[old.report_date, new.report_date];
  end if;

  if exists (
    select 1
    from public.rapro_sheets s
    where s.report_date = any (jours)
      and s.status = 'validated'
  ) then
    raise exception 'Rapprochement clôturé : réouvrez le jour pour le modifier.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke execute on function private.rapro_jour_cloture_fige() from public, anon, authenticated;

drop trigger if exists rapro_jour_cloture_fige on public.rapro_rooms;
create trigger rapro_jour_cloture_fige
  before insert or update or delete on public.rapro_rooms
  for each row execute function private.rapro_jour_cloture_fige();

-- 3) VÉRIFICATION (lecture seule) — doit lister les 2 triggers.
commit;

select event_object_table as table_name, trigger_name,
       string_agg(event_manipulation, ', ' order by event_manipulation) as evenements
from information_schema.triggers
where trigger_name in ('caisse_cloturee_figee', 'rapro_jour_cloture_fige')
group by event_object_table, trigger_name
order by 1;

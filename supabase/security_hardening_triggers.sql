-- =============================================================================
-- DURCISSEMENT SÉCURITÉ — estampillage SERVEUR des colonnes de validation/identité
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. SÛR EN PRODUCTION.
--
-- Pourquoi ce fichier séparé : les scripts de table (caisse_sheets.sql,
-- rapro_rooms.sql, …) contiennent du DDL de PREMIER déploiement — notamment
-- rapro_rooms.sql commence par `drop table … cascade`. Les relancer en prod
-- DÉTRUIRAIT des données. Ce fichier-ci ne contient QUE les triggers de
-- durcissement : additif, idempotent, et il NE MODIFIE AUCUNE LIGNE EXISTANTE.
--
-- Ce que ça change : `validated_at`, `validated_by`, `created_by`, `imported_by`
-- sont désormais posés côté serveur (now() / auth.uid()) à CHAQUE écriture
-- FUTURE — le client ne peut plus les falsifier ni post-dater. Les lignes déjà
-- en base gardent leurs valeurs actuelles telles quelles (les triggers ne
-- s'appliquent qu'aux INSERT/UPDATE à venir).
--
-- Opération : `create or replace function` + swap de trigger. Verrou métadonnées
-- très bref par table (aucune réécriture de données). Ré-exécutable sans effet.
-- =============================================================================

-- ---- caisse_sheets : verrou 24 h infalsifiable + signature fiable ------------
create or replace function public.caisse_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.status = 'validated' then
      new.validated_at := now();
      new.validated_by := auth.uid();
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  else -- UPDATE
    new.created_by := old.created_by;
    if new.status = 'validated' then
      if old.status is distinct from 'validated' then
        new.validated_at := now();
        new.validated_by := auth.uid();
      else
        new.validated_at := old.validated_at;   -- déjà validée : figée
        new.validated_by := old.validated_by;
      end if;
    else -- réouverture
      new.validated_at := null;
      new.validated_by := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists caisse_sheets_set_updated_at on public.caisse_sheets;
drop trigger if exists caisse_sheets_stamp on public.caisse_sheets;
create trigger caisse_sheets_stamp
  before insert or update on public.caisse_sheets
  for each row execute function public.caisse_stamp();

-- ---- rapro_sheets : signature de clôture fiable -----------------------------
create or replace function public.rapro_sheets_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.status = 'validated' then
      new.validated_at := now();
      new.validated_by := auth.uid();
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  else -- UPDATE
    new.created_by := old.created_by;
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

drop trigger if exists rapro_sheets_set_updated_at on public.rapro_sheets;
drop trigger if exists rapro_sheets_stamp on public.rapro_sheets;
create trigger rapro_sheets_stamp
  before insert or update on public.rapro_sheets
  for each row execute function public.rapro_sheets_stamp();

-- ---- rapro_rooms : created_by non falsifiable -------------------------------
create or replace function public.rapro_rooms_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists rapro_rooms_set_updated_at on public.rapro_rooms;
drop trigger if exists rapro_rooms_stamp on public.rapro_rooms;
create trigger rapro_rooms_stamp
  before insert or update on public.rapro_rooms
  for each row execute function public.rapro_rooms_stamp();

-- ---- pms_daily_metrics : imported_by non falsifiable ------------------------
create or replace function public.pms_daily_metrics_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.imported_by := auth.uid();   -- l'appelant réel, à chaque écriture
  return new;
end;
$$;

drop trigger if exists pms_daily_metrics_set_updated_at on public.pms_daily_metrics;
drop trigger if exists pms_daily_metrics_stamp on public.pms_daily_metrics;
create trigger pms_daily_metrics_stamp
  before insert or update on public.pms_daily_metrics
  for each row execute function public.pms_daily_metrics_stamp();

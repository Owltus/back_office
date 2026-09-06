-- =============================================================================
-- fk_auteur_triggers_2026-09-06 — complément de securite_audit_2026-09-06.sql
--
-- Application : `supabase db query --linked -f supabase/fk_auteur_triggers_2026-09-06.sql`
-- Idempotent, une transaction. Aucune donnée réécrite.
--
-- POURQUOI : la preuve « suppression d'un profil » a échoué après la pose des
-- FK `on delete set null` : l'action SET NULL est un UPDATE, qui déclenche les
-- triggers d'estampillage ; ceux-ci FIGENT l'auteur (`new.created_by :=
-- old.created_by`) et remettent l'identifiant du compte supprimé → violation
-- de la FK (`caisse_sheets_created_by_fkey`).
--
-- RÈGLE : l'auteur reste figé pour tout utilisateur de l'app (auth.uid() non
-- nul : un client ne peut jamais réécrire ni effacer un auteur). Une mise à
-- NULL venue d'un contexte système (service_role, FK, SQL editor : auth.uid()
-- nul) passe. C'est la même convention que parking_no_past_rewrite
-- (« contexte non-utilisateur : aucun garde-fou »). L'aide
-- private.keep_author(new, old) porte cette règle ; les 7 fonctions trigger
-- concernées l'utilisent (corps identiques à la prod pour le reste).
-- =============================================================================

begin;

create or replace function private.keep_author(new_val uuid, old_val uuid)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select case when new_val is null and auth.uid() is null then null else old_val end
$$;
revoke execute on function private.keep_author(uuid, uuid) from public, anon;
grant execute on function private.keep_author(uuid, uuid) to authenticated, service_role;

create or replace function public.affiche_stamp()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_at := now();
  else
    new.created_by := private.keep_author(new.created_by, old.created_by);
    new.updated_at := now();
  end if;
  return new;
end;
$function$;

create or replace function public.baby_cot_assignments_stamp()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := private.keep_author(new.created_by, old.created_by);
  end if;
  return new;
end;
$function$;

create or replace function public.caisse_cautions_stamp()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.refunded_by := null;
    new.refunded_at := null;
  elsif tg_op = 'UPDATE' then
    new.created_by := private.keep_author(new.created_by, old.created_by);
    if new.status = 'refunded' and old.status = 'active' then
      new.refunded_by := auth.uid();
      new.refunded_at := now();
    elsif new.status = 'active' and old.status = 'refunded' then
      -- Retour à 'active' (annulation d'un remboursement saisi par erreur) :
      -- on efface proprement la trace du remboursement précédent.
      new.refunded_by := null;
      new.refunded_at := null;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.caisse_stamp()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
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
    new.created_by := private.keep_author(new.created_by, old.created_by);
    new.countersigned_by := private.keep_author(new.countersigned_by, old.countersigned_by); -- non réécrivable par le client
    if new.status = 'validated' then
      if old.status is distinct from 'validated' then
        new.validated_at := now();
        new.validated_by := auth.uid();
      else
        new.validated_at := old.validated_at;
        new.validated_by := private.keep_author(new.validated_by, old.validated_by);
      end if;
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.literie_sheets_stamp()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
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
  else
    new.created_by := private.keep_author(new.created_by, old.created_by);
    if new.status = 'validated' then
      if old.status is distinct from 'validated' then
        new.validated_at := now();
        new.validated_by := auth.uid();
      else
        new.validated_at := old.validated_at;
        new.validated_by := private.keep_author(new.validated_by, old.validated_by);
      end if;
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.rapro_rooms_stamp()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := private.keep_author(new.created_by, old.created_by);
  end if;
  return new;
end;
$function$;

create or replace function public.rapro_sheets_stamp()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
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
    new.created_by := private.keep_author(new.created_by, old.created_by);
    if new.status = 'validated' then
      if old.status is distinct from 'validated' then
        new.validated_at := now();
        new.validated_by := auth.uid();
      else
        new.validated_at := old.validated_at;
        new.validated_by := private.keep_author(new.validated_by, old.validated_by);
      end if;
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  end if;
  return new;
end;
$function$;

-- Les 7 fonctions restent fermées à PUBLIC/anon/authenticated (create or
-- replace conserve l'ACL existante ; on le réaffirme par sûreté).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'pg_catalog.trigger'::regtype
      and p.proname in ('affiche_stamp','baby_cot_assignments_stamp','caisse_cautions_stamp',
                        'caisse_stamp','literie_sheets_stamp','rapro_rooms_stamp','rapro_sheets_stamp')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated;', r.sig);
  end loop;
end $$;

commit;

-- VÉRIFICATION (lecture seule)
select 'fonctions trigger utilisant keep_author (attendu 7)' as controle, count(*)::text as valeur
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prorettype = 'pg_catalog.trigger'::regtype
  and pg_get_functiondef(p.oid) like '%private.keep_author(%'
union all
select 'fonctions trigger figeant encore par affectation directe (attendu 0)', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prorettype = 'pg_catalog.trigger'::regtype
  and pg_get_functiondef(p.oid) ~ 'new\.(created_by|validated_by|countersigned_by) := old\.';

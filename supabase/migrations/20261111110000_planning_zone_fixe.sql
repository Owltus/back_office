-- Planning : plus de zones à régler (décision utilisateur du 2026-11-11,
-- page Besoins : « je ne suis pas sûr que ce soit pratique que ce soit
-- configurable… je préférerais l'avoir en dur »). L'établissement a UNE
-- zone, « Personnel », toujours tenue en continu ; un poste y entre quand il
-- est indispensable au fonctionnement (« les postes indispensables »).
--
--   1) la première zone (ordre, id) est gardée, renommée « Personnel » et
--      tenue en continu ; les autres perdent leurs postes, leurs chiffres
--      (cascade des consignes) et sont retirées (aucune à l'hôtel) ;
--   2) `planning_postes.zone_id` suit `indispensable`, par trigger, à toute
--      écriture (l'écran n'a plus de choix de zone) ;
--   3) la zone est figée : ni ajout, ni retrait, ni renommage, toujours en
--      continu (PL409).
--
-- Le calcul ne change pas : il lit toujours `zone_id`. Livraison :
-- écrit du contenu, `--avec-donnees`.

-- 1) La zone gardée.
do $$
declare
  v_zone bigint;
begin
  select id into v_zone from public.planning_zones order by ordre, id limit 1;
  if v_zone is null then
    insert into public.planning_zones (nom, ordre, continue)
    values ('Personnel', 0, true)
    returning id into v_zone;
  end if;
  update public.planning_postes
     set zone_id = case when indispensable then v_zone end
   where zone_id is distinct from case when indispensable then v_zone end;
  delete from public.planning_zones where id <> v_zone;
  update public.planning_zones
     set nom = 'Personnel', continue = true, ordre = 0
   where id = v_zone;
end $$;

-- 2) La zone d'un poste suit son importance.
create or replace function private.planning_poste_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.zone_id := case
    when new.indispensable then
      (select z.id from public.planning_zones z order by z.ordre, z.id limit 1)
  end;
  return new;
end;
$$;
revoke all on function private.planning_poste_zone() from public, anon, authenticated;

drop trigger if exists planning_poste_zone on public.planning_postes;
create trigger planning_poste_zone
  before insert or update of indispensable, zone_id on public.planning_postes
  for each row execute function private.planning_poste_zone();

-- 3) La zone est figée.
create or replace function private.planning_zone_fixe()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.id = old.id
     and new.nom = old.nom
     and new.ordre = old.ordre
     and new.continue then
    return new;
  end if;
  raise exception 'La zone du personnel est fixe.'
    using errcode = 'PL409';
end;
$$;
revoke all on function private.planning_zone_fixe() from public, anon, authenticated;

drop trigger if exists planning_zone_fixe on public.planning_zones;
create trigger planning_zone_fixe
  before insert or update or delete on public.planning_zones
  for each row execute function private.planning_zone_fixe();

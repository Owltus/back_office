-- Planning : le tableau du personnel PAR POSTE (décision utilisateur du
-- 2026-11-11, page Besoins : « indiquer combien il me faut de personnes en
-- réception ou au club… ce n'est pas nécessairement la réception et le club,
-- mais les postes qui sont importants ; pour la nuit, les postes de nuit »).
--
--   1) `planning_consignes.poste_id` : le chiffre d'un poste à un moment.
--      Null : le chiffre de toute la zone (jeux de test, ancien tableau).
--   2) Clé unique (zone, poste, jour, moment), deux null égaux.
--   3) Données (décision utilisateur : « tout sur la Réception ») : un
--      chiffre de NUIT va au poste de la zone qui ne tient que des horaires
--      de nuit ; un chiffre de JOUR au premier poste de jour de la zone (ordre
--      de l'organigramme, puis id). Aucun nom de poste lu. Sans poste qui
--      convient, le chiffre reste celui de la zone.
--
-- Livraison : retire une contrainte (`--supprimer`) et écrit du contenu
-- (`--avec-donnees`).

alter table public.planning_consignes
  add column poste_id bigint references public.planning_postes (id) on delete cascade;
comment on column public.planning_consignes.poste_id is
  'Poste du chiffre (2026-11-11). Null : toute la zone.';

alter table public.planning_consignes drop constraint planning_consignes_unique;
alter table public.planning_consignes
  add constraint planning_consignes_unique_poste
  unique nulls not distinct (zone_id, poste_id, jour, periode);

-- Un horaire permis au poste (liste vide : tous) et son moment de nuit.
with permis as (
  select p.id as poste_id, p.zone_id, p.ordre, m.est_nuit
    from public.planning_postes p
    join public.planning_horaires h
      on coalesce(cardinality(p.horaires_autorises), 0) = 0
      or h.id = any (p.horaires_autorises)
    join public.planning_moments m on m.id = h.periode
   where p.zone_id is not null and not p.ferme
),
nuit as (
  select zone_id, min(poste_id) as poste_id
    from (select poste_id, zone_id
            from permis
           group by poste_id, zone_id
          having bool_and(est_nuit)) n
   group by zone_id
),
jour as (
  select distinct on (zone_id) zone_id, poste_id
    from permis
   where not est_nuit
   order by zone_id, ordre, poste_id
)
update public.planning_consignes c
   set poste_id = case
         when m.est_nuit then (select poste_id from nuit where nuit.zone_id = c.zone_id)
         else (select poste_id from jour where jour.zone_id = c.zone_id)
       end
  from public.planning_moments m
 where m.id = c.periode
   and c.poste_id is null;

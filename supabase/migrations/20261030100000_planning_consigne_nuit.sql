-- Minimum de présence la nuit (demande utilisateur du 2026-10-30, plan
-- plan/planning-cycles-2026-10-30/) : les consignes de présence admettent
-- la nuit, à côté du matin et du soir. Aucune donnée écrite : la nuit n'a
-- pas de minimum tant qu'on n'en pose pas un dans les Besoins.
--
-- Contrainte CHECK retirée puis recréée sous le même nom sur la même table
-- (ne compte pas comme un retrait, décision utilisateur du 2026-10-27).

alter table public.planning_consignes
  drop constraint planning_consignes_periode_check;

alter table public.planning_consignes
  add constraint planning_consignes_periode_check
  check (periode in ('matin', 'soir', 'nuit'));

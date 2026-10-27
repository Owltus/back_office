-- Familles de codes horaires (demande utilisateur du 2026-10-27) : en plus du
-- matin, du soir et de la nuit, le « middle » (à cheval entre le matin et le
-- soir) et le « court » (moins de 7 h de travail). Aucun nouveau code : on
-- range ceux qui existent.
--
-- Les consignes de présence ne changent pas : un middle ou un court y compte
-- selon son heure de début, comme un horaire libre (lib/planning/presence.ts).
--
-- Contrainte CHECK retirée puis recréée sous le même nom sur la même table
-- (ne compte pas comme un retrait, décision utilisateur du 2026-10-27).

alter table public.planning_horaires
  drop constraint planning_horaires_periode_check;

alter table public.planning_horaires
  add constraint planning_horaires_periode_check
  check (periode in ('matin', 'middle', 'soir', 'nuit', 'court'));

comment on column public.planning_horaires.periode is
  'Famille du code : matin, middle, soir, nuit ou court ; null : à part (direction, supervision).';

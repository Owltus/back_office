-- Plus de moment « court » (demande utilisateur du 2026-10-31 : « les
-- horaires courts, rangez-les au matin, au middle ou au soir d'après leur
-- début : s'il commence à 17 h, c'est du soir ; à 7 h, du matin »).
-- Même règle que `momentPropose` (lib/planning/affichage.ts), écrite en SQL :
-- les heures « HH:MM » se comparent comme du texte. En prod : 07:00-10:00,
-- 07:00-11:45, 07:00-12:45 et 08:00-13:45 passent au matin, 17:00-22:00 et
-- 19:00-22:00 au soir. Leur LONGUEUR reste une règle des remplaçants (un
-- court ne remplace qu'un court, `estCourt`), sans rien en base.
--
-- Contrainte CHECK retirée puis recréée sous le même nom sur la même table
-- (ne compte pas comme un retrait, décision utilisateur du 2026-10-27).

update public.planning_horaires
set periode = case
  when debut >= '21:00' or debut < '05:00' then 'nuit'
  when fin <= debut or fin >= '21:00' or debut >= '15:00' then 'soir'
  when debut < '09:00' and fin <= '17:45' then 'matin'
  else 'middle'
end
where periode = 'court';

alter table public.planning_horaires
  drop constraint planning_horaires_periode_check;

alter table public.planning_horaires
  add constraint planning_horaires_periode_check
  check (periode in ('matin', 'middle', 'soir', 'nuit'));

comment on column public.planning_horaires.periode is
  'Moment de l''horaire : matin, middle, soir ou nuit (proposé d''après les heures, modifiable).';

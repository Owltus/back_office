-- Jour de travail seul interdit avec un seul jour d'affilée conseillé :
-- aucun jour n'est plaçable pour un contrat au rythme humain, et le
-- planning automatique laissait des places vides sans rien dire
-- (relecture du 2026-11-05). L'écran le refuse ; la base aussi désormais.
--
-- AJOUT seul. `not valid` : une ligne déjà dans ce cas n'empêche pas la
-- migration de passer ; « À vérifier » le signale (`jours-affiles-un-seul`)
-- et toute écriture suivante de la ligne exige de le corriger.

alter table public.planning_reglages
  add constraint planning_reglages_jour_isole_affiles
    check (jour_isole <> 'interdit' or jours_affiles_conseilles >= 2)
    not valid;

comment on constraint planning_reglages_jour_isole_affiles
  on public.planning_reglages is
  'Jour de travail seul interdit : au moins 2 jours d''affilée conseillés, sinon aucun jour n''est plaçable.';

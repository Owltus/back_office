-- Mineur : un apprenti ou un stagiaire seulement (décision utilisateur du
-- 2026-11-01 : un CDI, un CDD ou un extra est majeur). Données : personne
-- n'est déclaré mineur ; rien à reprendre.

alter table public.planning_salaries
  add constraint planning_salaries_mineur_alternance
  check (not mineur or type_contrat in ('apprenti', 'stagiaire'));

-- Cadre au forfait jours : un CDI ou un CDD seulement (décision utilisateur
-- du 2026-11-01 : « il n'y a que la direction qui peut être cadre » ; jamais
-- un apprenti, un stagiaire ni un extra). La restriction au groupe Direction
-- est tenue par l'écran (le groupe se renomme, la base ne le juge pas).
-- Données : une seule personne au forfait, en CDI ; rien à reprendre.

alter table public.planning_salaries
  add constraint planning_salaries_forfait_cadre
  check (not forfait_jours or type_contrat in ('cdi', 'cdd'));

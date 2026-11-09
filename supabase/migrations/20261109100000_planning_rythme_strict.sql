-- Rythme 5 jours puis 2 jours, strict (décision de l'utilisateur du
-- 2026-11-09 : « les repos, il faut qu'ils soient absolument sur 2 jours
-- d'affilée, donc c'est normal que pour la semaine de travail ce soit le cas
-- aussi »). Pour les contrats au rythme humain (`rythme_contrat_min`, 35 h à
-- l'hôtel) : des blocs de 5 jours de travail et de 2 jours de repos, sauf
-- contre un jour neutre (école, congé, hors contrat). Lu par `lireRegles`
-- (`repos.rythmeStrict`). Ajout seul, aucun contenu écrit.

alter table public.planning_reglages
  add column rythme_strict boolean not null default true;

comment on column public.planning_reglages.rythme_strict is
  'Rythme 5 jours de travail puis 2 jours de repos, strict, pour les contrats au rythme humain.';

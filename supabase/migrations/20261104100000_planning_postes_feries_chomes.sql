-- Jours fériés chômés le jour même (décision utilisateur du 2026-11-04) :
-- l'encadrement (direction, adjoints, responsable technique) ne rattrape pas
-- ses jours fériés, il les prend le jour même. Un jour férié qui tombe un
-- jour de travail de sa semaine type est chômé (absence JF, décomptée) ; un
-- jour de repos habituel, rien. Sans jour « Travaille » dans la semaine
-- type : tous les jours fériés. Il faut un an d'ancienneté, comme pour le
-- rattrapage. Vaut pour qui a ce poste en premier poste de titulaire.
--
-- Ajout seul, AUCUNE donnée écrite : tous les postes partent à faux (le
-- rattrapage d'avant). La case se coche dans la page Postes.

alter table public.planning_postes
  add column feries_chomes boolean not null default false;

comment on column public.planning_postes.feries_chomes is
  'Jours fériés chômés le jour même, sans rattrapage (encadrement) ; pour qui a ce poste en premier poste de titulaire.';

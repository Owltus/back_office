-- Importance des postes : OUI / NON (décision utilisateur du 2026-11-05).
--
-- « Soit un poste est important, soit il ne l'est pas. » Les postes qui ne
-- sont pas indispensables au fonctionnement (Direction, Adjoint de
-- direction, Supervision réception, Responsable technique) : si pendant
-- deux jours il n'y en a pas, l'hôtel tourne grâce à la Réception, au Club
-- et aux veilleurs.
--
-- AJOUT SEULEMENT : la contrainte CHECK de la colonne n'est pas retouchée
-- (trois valeurs acceptées). L'application ne propose plus que
-- 'indispensable' et 'si_possible' ; une ancienne valeur 'important' est
-- lue comme NON indispensable (`estIndispensable`, lib/planning/modele.ts).
--
-- Données écrites : les postes 'important' passent à 'si_possible' (même
-- sens désormais), et un poste créé ensuite est non indispensable par
-- défaut. Livraison : `--avec-donnees`.

update public.planning_postes
   set importance = 'si_possible'
 where importance = 'important';

alter table public.planning_postes
  alter column importance set default 'si_possible';

comment on column public.planning_postes.importance is
  'Poste indispensable au fonctionnement (''indispensable'') ou non (''si_possible'' ; l''ancienne valeur ''important'' se lit non). Le planning remplit d''abord les postes indispensables.';

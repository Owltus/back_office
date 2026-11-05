-- Continuité entre équipes OBLIGATOIRE (plan
-- `planning-moteur-configurable-2026-11-05`, étape 4, décision utilisateur
-- D8 du 2026-11-05 : « il faut a minima que les deux shifts terminent et
-- commencent en même temps pour garantir le fonctionnement et la
-- continuité, et au mieux se croisent »). Un trou entre la fin d'une équipe
-- et l'arrivée de la suivante (passation avec le veilleur comprise) coûte
-- désormais une place nécessaire au calcul ; le chevauchement (relève) reste
-- une préférence. Jamais une contrainte dure : si personne ne peut tenir, la
-- case reste vide (D3).
--
-- Ajout seul : le défaut de la colonne passe à vrai, et la ligne des
-- réglages (id 1) prend la décision. Données écrites : cette seule ligne
-- (livraison : `--avec-donnees`).

alter table public.planning_reglages
  alter column continuite_obligatoire set default true;

update public.planning_reglages
   set continuite_obligatoire = true
 where id = 1;

comment on column public.planning_reglages.continuite_obligatoire is
  'Aucun trou entre la fin d''une équipe et le début de la suivante (veilleur compris) : au niveau d''une place nécessaire (D8, défaut) ; faux = une préférence.';

-- Planning : plus de calendrier d'école pour les stagiaires (décision de
-- l'utilisateur du 2026-11-09 : « retire la notion de planning d'école pour
-- les stagiaires, pas nécessaire ; garde-la bien pour les apprentis »).
--
-- La case « Alternance » du type de contrat Stagiaire passe à non. Elle
-- reste réglable dans Équipe, Règles des contrats. Apprenti n'est pas
-- touché. Aucun stagiaire n'a de jour d'école en base (vérifié en local) :
-- aucune absence n'est retirée.
--
-- Le niveau proposé à l'ajout d'un poste dans la fiche (Soutien) ne suit
-- plus l'alternance : nouvelle case du type de contrat, « Proposé en
-- soutien » (même décision : « par défaut, un stagiaire ou un apprenti est
-- en soutien, mais cela peut vite changer »). Seulement une proposition,
-- toujours modifiable dans la fiche. Vraie pour Stagiaire et Apprenti.
--
-- Écrit du contenu : livraison avec --avec-donnees. Ajout seul (colonne).

update public.planning_modeles_contrat
   set alternance = false
 where type_contrat = 'stagiaire'
   and alternance;

alter table public.planning_modeles_contrat
  add column if not exists soutien_par_defaut boolean not null default false;

comment on column public.planning_modeles_contrat.soutien_par_defaut is
  'Niveau Soutien proposé quand on ajoute un poste dans la fiche (modifiable).';

update public.planning_modeles_contrat
   set soutien_par_defaut = true
 where type_contrat in ('stagiaire', 'apprenti')
   and not soutien_par_defaut;

-- Planning : un apprenti ou un stagiaire n'est jamais sans un salarié
-- confirmé (décision de l'utilisateur du 2026-11-09 : « imagine un hôtel où
-- tout le personnel sur le poste sont des apprentis, pas ouf niveau
-- responsabilité. Donc toujours avec un CDI ou CDD hôtelier normal, et pareil
-- pour les stagiaires. »).
--
-- Nouvelle case du type de contrat, « Jamais sans un salarié confirmé » :
-- une personne dont le contrat l'a n'est jamais sur son poste sans une
-- personne présente en même temps, sur le même poste, au niveau autonome
-- (titulaire ou dépannage), dont le contrat ne l'a pas. Quel que soit son
-- niveau. Réglable dans Équipe, Règles des contrats. Vraie pour Stagiaire
-- et Apprenti.
--
-- Écrit du contenu : livraison avec --avec-donnees. Ajout seul (colonne).

alter table public.planning_modeles_contrat
  add column if not exists accompagne boolean not null default false;

comment on column public.planning_modeles_contrat.accompagne is
  'Jamais sans un salarié confirmé (contrat sans cette case, autonome) sur son poste.';

update public.planning_modeles_contrat
   set accompagne = true
 where type_contrat in ('stagiaire', 'apprenti')
   and not accompagne;

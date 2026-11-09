-- Formation = du travail pour le rythme 5 jours puis 2 jours (décision de
-- l'utilisateur du 2026-11-09 : une formation compte TOUJOURS comme du
-- travail, même de deux semaines ; elle ne devient jamais neutre comme un
-- congé ou une maladie de plus de 5 jours). Le moteur ne lit aucun code ni
-- nom de motif : c'est une propriété réglable du motif, `rythme_travail`,
-- lue par `statutAbsence` (rythmeStrict.ts) pour un motif au décompte.
--
-- Ajout d'une colonne, puis CONTENU : le motif de formation déjà en base
-- (code FO ou nom « Formation ») est marqué. La livraison demande donc
-- `--avec-donnees`.

alter table public.planning_motifs
  add column rythme_travail boolean not null default false;

comment on column public.planning_motifs.rythme_travail is
  'Compte toujours comme du travail pour le rythme 5 jours puis 2 jours, même sur une longue période (formation).';

update public.planning_motifs
   set rythme_travail = true
 where nature = 'absence'
   and decompte
   and (code = 'FO' or lower(nom) like 'formation%');

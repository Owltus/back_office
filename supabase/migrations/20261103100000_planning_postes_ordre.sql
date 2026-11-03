-- Ordre des postes (demande utilisateur du 2026-11-03 : « pour des questions
-- d'ego, de statut et d'organigramme », ranger les lignes du planning dans
-- l'ordre Direction, adjointe, technique, supervision, puis l'accueil).
--
-- Dans chaque groupe, une personne se range au rang de son poste le plus
-- haut (`parGroupe`, `affichage.ts`). L'ordre se règle par des flèches
-- Monter / Descendre dans la page Postes : jamais de valeur à saisir ;
-- l'app réécrit 0..n à chaque déplacement, deux postes ne partagent donc
-- jamais un rang.
--
-- Ajout seul, AUCUNE donnée écrite : tous les postes partent à 0, départagés
-- par leur id (l'ordre d'avant). Le premier déplacement fixe tout l'ordre.

alter table public.planning_postes
  add column ordre integer not null default 0;

comment on column public.planning_postes.ordre is
  'Rang du poste dans l''organigramme (0 = le plus haut), réglé par Monter / Descendre ; à égalité, l''id départage.';

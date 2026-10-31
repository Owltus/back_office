-- Repos posé à une date (demande utilisateur du 2026-10-31 : « poser un
-- repos normal, comme ceux de la semaine type, pas un repos exceptionnel »).
-- Un motif de nature « repos » : un jour sans travail qui ne retire aucune
-- heure due (decompte = false), affiché comme le repos de la semaine type.
--
-- Contrainte CHECK retirée puis recréée sous le même nom sur la même table
-- (ne compte pas comme un retrait, décision utilisateur du 2026-10-27).

alter table public.planning_motifs
  drop constraint planning_motifs_nature_check;

alter table public.planning_motifs
  add constraint planning_motifs_nature_check
  check (nature in ('absence', 'ecole', 'repos'));

-- Le motif « Repos », une seule fois. Seulement sur une base qui a déjà ses
-- motifs (prod, copie de la prod) : une base rejouée depuis zéro le reçoit
-- du seed, joué après les migrations (sinon les identifiants du seed
-- entreraient en conflit).
insert into public.planning_motifs (code, nom, couleur, decompte, nature)
select 'R', 'Repos', '#64748b', false, 'repos'
where exists (select 1 from public.planning_motifs)
  and not exists (
    select 1 from public.planning_motifs where nature = 'repos'
  );

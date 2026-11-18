-- =====================================================================
-- Planning : un jour férié chômé posé par le planning reste une proposition
-- (audit de sécurité run-2 du 2026-11-18, étape 1 du plan
-- `plan/securite-audit-run2-2026-11-18/`)
-- =====================================================================
-- Symptôme : le jour férié chômé (motif au rôle `ferie_chome`) écrit par la
--   génération arrive VALIDÉ d'office, alors que le reste du calcul arrive
--   en proposition. « Effacer » et un nouveau calcul ne le retirent pas.
-- Cause : `private.planning_absence_epinglee` (dernière définition :
--   20261106110000) ne laisse en proposition que les repos et le rôle
--   `ferie_rattrape`. Le rôle `ferie_chome`, ajouté le 2026-11-12, n'a pas
--   suivi, alors que `planning_valider_avec_repos` le traite déjà comme une
--   proposition à valider.
-- Correctif : le rôle `ferie_chome` rejoint `ferie_rattrape` dans le test.
-- Innocuité : une absence posée à la main arrive avec `epinglee = true` (ou
--   le défaut) et reste validée. Les lignes déjà en base ne sont pas
--   réécrites (le trigger ne joue qu'à l'écriture).
-- =====================================================================

create or replace function private.planning_absence_epinglee()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if not new.epinglee and not exists (
    select 1 from public.planning_motifs m
     where m.id = new.motif_id
       and (m.nature = 'repos' or m.role in ('ferie_rattrape', 'ferie_chome'))) then
    new.epinglee := true;
  end if;
  return new;
end $function$;

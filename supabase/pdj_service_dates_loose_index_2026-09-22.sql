-- ---------------------------------------------------------------------------
-- pdj_service_dates : parcours d'index sauteur à la place du scan complet
-- 2026-09-22
--
-- SYMPTÔME
--   `pdj_service_dates` est la deuxième requête la plus chère de l'application
--   (pg_stat_statements sur deux jours : 38 appels, 1 057 ms de MOYENNE,
--   3 874 ms au pire). Elle ne sert qu'à griser, dans les sélecteurs de date,
--   les jours sans données. Mesurée dans le navigateur le 2026-09-22 sur /pdj :
--   1 365 ms.
--
-- CAUSE
--   La vue était `select distinct service_date from pdj_breakfasts`. Le
--   planificateur IGNORE l'index `pdj_breakfasts_service_date_idx` — qui existe
--   pourtant déjà — parce qu'un `DISTINCT` nu ne lui donne aucune raison de
--   sauter : il lit les 13 601 lignes puis dédoublonne par hachage, pour ne
--   rendre que 251 dates.
--
--     HashAggregate (actual time=348.951..348.996 rows=251)
--       -> Seq Scan on pdj_breakfasts (actual rows=13601)
--     Execution Time: 349.898 ms
--
--   PostgreSQL ne sait pas faire de « loose index scan » tout seul. On l'écrit
--   donc à la main : partir de la plus petite date, puis demander à l'index la
--   plus petite date STRICTEMENT supérieure, et recommencer. 251 sondes dans
--   l'index au lieu de 13 601 lectures de lignes.
--
-- CORRECTIF
--   Réécriture de la vue en CTE récursive. Le plan devient un
--   `Index Only Scan using pdj_breakfasts_service_date_idx`, 251 boucles.
--
-- INNOCUITÉ
--   * Résultat IDENTIQUE, prouvé dans les deux sens avant application :
--       lignes ancien = 251, lignes nouveau = 251,
--       ancien EXCEPT ALL nouveau = 0, nouveau EXCEPT ALL ancien = 0.
--   * `create or replace view` CONSERVE les droits (`SELECT` à `authenticated`
--     seul ; `anon` reste sans aucun privilège) et la même colonne unique.
--   * `security_invoker = true` est REPOSÉ explicitement : sans lui la vue
--     s'exécuterait avec les droits de son propriétaire et court-circuiterait
--     les RLS de `pdj_breakfasts`. C'est le point à ne jamais oublier ici.
--   * Aucune écriture, aucun DDL destructeur, aucun index créé ou supprimé —
--     l'index utilisé existait déjà.
--   * Les RLS s'appliquent exactement comme avant : la récursion interroge
--     `pdj_breakfasts` en tant qu'appelant, donc un compte qui ne voit qu'un
--     sous-ensemble de lignes n'obtient que les dates de ce sous-ensemble.
--
-- GAIN MESURÉ (sous le rôle `authenticated`, RLS appliquées)
--   avant   317,885 ms
--   après   132,817 ms      soit 2,4x
--
--   (En superutilisateur, sans RLS : 349,898 ms -> 107,267 ms.)
--
-- RESTE À GAGNER
--   `Heap Fetches: 410` dans le plan : la carte de visibilité n'est pas à jour,
--   l'index-only scan doit donc encore toucher la table. Un `vacuum` sur
--   `pdj_breakfasts` le ferait tomber à zéro. Laissé à l'autovacuum : ce
--   script ne fait aucune maintenance non demandée sur une base de production.
--
-- VÉRIFICATION (après application)
--   select count(*) from public.pdj_service_dates;              -- 251
--   explain (analyze) select * from public.pdj_service_dates;   -- Index Only Scan
--   select reloptions from pg_class
--    where relname = 'pdj_service_dates';                       -- {security_invoker=true}
-- ---------------------------------------------------------------------------

begin;

create or replace view public.pdj_service_dates
with (security_invoker = true) as
with recursive dates_sautees as (
  -- Amorce : la plus ancienne date de service.
  (
    select min(service_date) as service_date
    from public.pdj_breakfasts
  )
  union all
  -- Saut : la plus petite date STRICTEMENT supérieure à la précédente. C'est
  -- cette sous-requête corrélée qui devient un Index Only Scan borné à une
  -- ligne, et qui remplace le parcours complet de la table.
  (
    select (
      select min(b.service_date)
      from public.pdj_breakfasts b
      where b.service_date > d.service_date
    )
    from dates_sautees d
    where d.service_date is not null
  )
)
select service_date
from dates_sautees
where service_date is not null;

commit;

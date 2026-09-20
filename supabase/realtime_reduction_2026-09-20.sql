-- =============================================================================
-- Temps réel réduit au seul planning parking
--
-- SYMPTÔME  Les pages sont « parfois » très longues à charger, avec des gels
--           de plusieurs secondes, alors que l'application n'a jamais plus de
--           deux utilisateurs simultanés et que la base entière pèse 11 Mo.
--
-- CAUSE     Mesure `pg_stat_statements` du 2026-09-20, sur 13 j 17 h :
--             realtime.list_changes()  5 874,9 s de CPU — 71,1 % — 1 006 056 appels
--             applicatif et autre      1 409,9 s        — 17,1 %
--             postgrest cache schéma     543,9 s        —  6,6 %
--             realtime divers            326,6 s        —  4,0 %
--           Soit 0,85 appel par seconde EN CONTINU, que quelqu'un soit
--           connecté ou non, pour trois tables publiées. L'instance est une
--           Micro (2 vCPU partagés, 1 Go) : le crédit de puissance s'épuise et
--           tout gèle. La preuve tient en une ligne — `set_config()`, appel
--           purement mémoire sans I/O ni ligne rendue, met 5,13 ms en moyenne
--           et jusqu'à 1 211 ms, là où il devrait en mettre 0,02.
--
-- CORRECTIF On ne garde le temps réel que là où deux personnes travaillent
--           réellement en même temps sur le même écran : le planning parking,
--           avec son glisser-déposer. Les coches du petit-déjeuner et les lits
--           bébé passent au rafraîchissement au retour d'onglet (déjà livré
--           côté application, commit précédent — l'ordre compte : le
--           remplacement est en place AVANT que la publication soit réduite).
--
-- DÉCISION  Celle de l'utilisateur, le 2026-09-20 (plan
--           perf-chargement-2026-09-20, angle D1, option B). Elle RÉVISE la
--           décision du 2026-09-06 « Realtime conservé partout », prise avant
--           que son coût ne soit chiffré.
--
-- INNOCUITÉ `alter publication` ne touche AUCUNE donnée, aucune colonne,
--           aucune policy, aucune ligne. Il ne fait que décider de ce qui est
--           publié dans le flux de réplication.
--
-- ⚠ ATTENTE RAISONNABLE, PAS PROMESSE. Le poller lit le journal de
--   réplication, pas les tables une par une : retirer deux tables sur trois
--   réduit le volume de changements à décoder, mais NE DIVISE PAS le coût par
--   trois — il continuera de tourner pour `parking_reservations`. Le gain réel
--   est inconnu tant qu'il n'est pas constaté. Il se mesure en remettant
--   `pg_stat_statements` à zéro puis en relisant la répartition 24 h plus tard
--   (`supabase/verif_perf_2026-09-20.sql`, section 2).
--
-- RETOUR    Une ligne, symétrique :
--   ARRIÈRE   alter publication supabase_realtime add table public.pdj_breakfasts;
--             alter publication supabase_realtime add table public.baby_cot_assignments;
--           À faire sans hésiter si l'usage montre que le direct manquait
--           vraiment sur ces deux écrans.
-- =============================================================================

alter publication supabase_realtime drop table public.pdj_breakfasts;
alter publication supabase_realtime drop table public.baby_cot_assignments;

-- Contrôle : il ne doit rester que `parking_reservations`.
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

-- =============================================================================
-- REPJOUR — nettoyage des alertes TVA OBSOLÈTES stockées dans daily_reports.alerts
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, dans l'ordre.
--
-- POURQUOI
--   La détection « TVA en double » a été SUPPRIMÉE du code. Mais des alertes de
--   ses ANCIENNES versions restent enregistrées dans la colonne `alerts` (jsonb)
--   de certains jours et s'affichent encore sur le tableau de bord. Ce script les
--   retire, en préservant toutes les autres alertes légitimes de chaque jour.
--
--   Formulations observées, toutes visées (variantes d'un même faux positif) :
--     - « … inclure la TVA deux fois … »              (06/2026)
--     - « … TVA en double, ou tu corriges … »          (27-28/07/2026)
--     - « … la TVA est sûrement comptée deux fois … »  (version encore déployée)
--   + l'ancien message HT : « … la TVA n'est … pas incluse dans ce fichier … »
--
--   Prédicat SÛR : message parlant de TVA ET (« deux fois » OU « en double »), ou
--   l'ancien message HT. Il n'attrape PAS les autres alertes (jours manquants,
--   écart d'occupation, etc.). La détection « TVA en double » n'existant plus, tout
--   message correspondant est forcément obsolète.
--
-- NATURE : modifie de la donnée d'AFFICHAGE (alertes), pas les chiffres du
--   rapport. Ciblé par WHERE. Fais l'aperçu (1) avant le nettoyage (2).
-- =============================================================================


-- 1) APERÇU — jours portant une alerte TVA obsolète (à lancer d'abord).
select date, year, month, alerts as alertes_actuelles
from daily_reports
where jsonb_typeof(alerts) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(alerts) as e
    where (
        e->>'message' ilike '%tva%'
        and (e->>'message' ilike '%deux fois%' or e->>'message' ilike '%en double%')
      )
      or e->>'message' ilike '%pas incluse dans ce fichier%'
  )
order by date;


-- 2) NETTOYAGE — retire ces alertes, garde les autres (à lancer après l'aperçu).
update daily_reports
set alerts = coalesce(
  (
    select jsonb_agg(e)
    from jsonb_array_elements(alerts) as e
    where not (
      (
        e->>'message' ilike '%tva%'
        and (e->>'message' ilike '%deux fois%' or e->>'message' ilike '%en double%')
      )
      or e->>'message' ilike '%pas incluse dans ce fichier%'
    )
  ),
  '[]'::jsonb
)
where jsonb_typeof(alerts) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(alerts) as e
    where (
        e->>'message' ilike '%tva%'
        and (e->>'message' ilike '%deux fois%' or e->>'message' ilike '%en double%')
      )
      or e->>'message' ilike '%pas incluse dans ce fichier%'
  );


-- 3) VÉRIFICATION — doit renvoyer 0 après le nettoyage.
select count(*) as jours_encore_concernes
from daily_reports
where jsonb_typeof(alerts) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(alerts) as e
    where (
        e->>'message' ilike '%tva%'
        and (e->>'message' ilike '%deux fois%' or e->>'message' ilike '%en double%')
      )
      or e->>'message' ilike '%pas incluse dans ce fichier%'
  );

-- =============================================================================
-- diag_repjour_jour_veille — CONTRÔLE (lecture seule) des 2 derniers RepJour.
--
-- Sort les 2 rapports les plus récents (aujourd'hui + hier) avec :
--   - le RÉALISÉ du jour et MTD,
--   - le PROJETÉ stocké (pm_*),
--   - les AGRÉGATS du Forecast du mois qui alimentent ce projeté,
--   - des repères de cohérence pour repérer un projeté faux/périmé/partiel.
--
-- LECTURE DU DIAGNOSTIC :
--   * fc_days < days_in_month      -> Forecast PARTIEL (projeté sous-estimé).
--   * fc_last_import ancien         -> Forecast PÉRIMÉ (pas ré-importé ce cycle).
--   * pm_nuitees <> fc_occ_sum  OU  pm_room_rev <> fc_revttc_sum
--                                  -> projeté PÉRIMÉ (pm_* pas recalculé depuis le
--                                     dernier Forecast — Comparison arrivé après).
--   * fc_days = 0                   -> aucun Forecast pour ce mois.
--
-- À EXÉCUTER PAR L'UTILISATEUR (Supabase → SQL Editor). N'écrit rien.
-- =============================================================================

select
  d.date,
  d.day_of_month || '/' || d.days_in_month              as jour_sur_mois,
  -- Réalisé du jour
  round(d.rj_nuitees)                                    as rj_nuitees,
  round(d.rj_to::numeric, 1)                             as rj_to_pct,
  round(d.rj_pm::numeric, 1)                             as rj_pm,
  round(d.rj_room_revenue::numeric)                      as rj_room_rev,
  -- Réalisé cumulé mois (MTD)
  round(d.rmtd_nuitees)                                  as rmtd_nuitees,
  round(d.rmtd_room_revenue::numeric)                    as rmtd_room_rev,
  -- Projeté mois STOCKÉ (pm_*)
  round(d.pm_nuitees)                                    as pm_nuitees,
  round(d.pm_to::numeric, 1)                             as pm_to_pct,
  round(d.pm_pm::numeric, 1)                             as pm_pm,
  round(d.pm_revpar::numeric, 1)                         as pm_revpar,
  round(d.pm_room_revenue::numeric)                      as pm_room_rev,
  -- Forecast du mois (source du projeté)
  f.fc_days,
  round(f.fc_occ_sum)                                    as fc_occ_sum,
  round(f.fc_revttc_sum::numeric)                        as fc_revttc_sum,
  f.fc_last_import,
  -- Repères de cohérence (projeté stocké vs Forecast actuel)
  round((d.pm_nuitees - f.fc_occ_sum))                   as ecart_nuitees_pm_vs_fc,
  round((d.pm_room_revenue - f.fc_revttc_sum)::numeric)  as ecart_roomrev_pm_vs_fc,
  case when f.fc_days = 0 then 'AUCUN forecast'
       when f.fc_days < d.days_in_month then 'forecast PARTIEL'
       else 'forecast complet' end                       as etat_forecast,
  -- Traçabilité
  d.imported_at,
  d.auto_sent_at
from public.daily_reports d
left join lateral (
  select
    count(*)                       as fc_days,
    coalesce(sum(fd.occ), 0)       as fc_occ_sum,
    coalesce(sum(fd.rev_ttc), 0)   as fc_revttc_sum,
    max(fd.imported_at)            as fc_last_import
  from public.forecast_days fd
  where fd.year = d.year and fd.month = d.month
) f on true
-- Les 4 derniers rapports (couvre vendredi, jeudi et les jours avant, pour voir le
-- avant/apres sans deviner les dates). Restreindre avec `where d.date in (...)` si besoin.
order by d.date desc
limit 4;

-- Rapport journalier (RepJour) en HT — décision utilisateur du 2026-10-31.
--
-- Avant : tout le rapport était en TTC. Le fichier Comparison donne pourtant
-- son « ROOM REVENUE » en HT : l'app le multipliait par 1,1. Le Forecast était
-- exporté en TTC (« Include Tax »). Désormais tout est en HT : rien n'est plus
-- converti, et les montants déjà enregistrés passent en HT ici, une fois.
--
-- Ce que fait cette migration (une seule transaction) :
--   1. budget 2026 : les chiffres HT fournis par l'utilisateur, TELS QUELS
--      (PM, RevPAR, CA ; nuitées et TO inchangés). Garde : chaque mois doit
--      porter l'ancien CA TTC attendu (ou déjà le HT) ; sinon tout s'arrête,
--      rien n'est écrit en silence sur un budget qui aurait changé. Les autres
--      années éventuelles sont divisées par 1,1.
--   2. daily_reports : CA du jour et du mois = le chiffre HT EXACT du fichier
--      (`pms_daily_metrics`, section ROOM REVENUE) quand il est gardé ET qu'il
--      correspond bien au TTC enregistré (×1,1 au centime) ; sinon le TTC ÷ 1,1.
--      Projeté du mois ÷ 1,1. PM et RevPAR recalculés avec les formules de
--      l'app (`calc/kpi.ts`), vérifiées identiques aux valeurs stockées (écart
--      maximal 0,005 = l'arrondi) avant d'écrire cette migration.
--      Nuitées, TO, dates, auteur, alertes : inchangés.
--   3. forecast_days : `rev_ht` existait déjà (TTC ÷ 1,1 à l'import) et fait
--      foi, SAUF pour une reprise ancienne (janvier à juin 2026 sur la copie
--      de la prod, trouvée par une relecture adverse) dont la colonne
--      « rev_ttc » portait en réalité du HT : sa somme × 1,1 retombe sur le
--      CA TTC réalisé du mois, et son `rev_ht` était donc divisé deux fois.
--      Un mois COMPLET (une prévision par jour, rapport du dernier jour) dont
--      la somme de `rev_ttc` égale le CA HT réalisé à 0,5 % près prend
--      `rev_ht = rev_ttc` ; un mois en vrai TTC en est à 10 %, il ne bouge
--      pas. Puis `adr_ttc` devient `adr_ht` (recalculé) et `rev_ttc` est
--      RETIRÉE (accord explicite de l'utilisateur, livraison du 2026-10-31).
--   4. les deux fonctions qui sommaient `rev_ttc` lisent `rev_ht` ; le tableau
--      de bord rend `revHT` au lieu de `revTTC` (lu par services/daily.ts).

-- 1. Budget ------------------------------------------------------------------
do $$
declare
  ecart int;
begin
  select count(*) into ecart
  from public.budget b
  join (values
    (1, 183541, 100.70, 67.28, 166855),
    (2, 162424, 101.55, 65.92, 147658),
    (3, 205888, 110.10, 75.47, 187171),
    (4, 189771, 98.47, 71.88, 172519),
    (5, 220948, 109.40, 80.99, 200862),
    (6, 308155, 139.79, 116.73, 280141),
    (7, 188269, 94.87, 69.02, 171154),
    (8, 171235, 87.45, 62.77, 155668),
    (9, 269411, 121.97, 102.05, 244919),
    (10, 223413, 110.86, 81.90, 203103),
    (11, 207506, 113.64, 78.60, 188642),
    (12, 172653, 102.19, 63.29, 156957)
  ) v(mois, ttc, pm, revpar, ht) on v.mois = b.month
  where b.year = 2026
    and b.room_revenue not in (v.ttc, v.ht);
  if ecart > 0 then
    raise exception 'Budget 2026 : % mois ne portent pas le CA TTC attendu. Rien n''est converti.', ecart;
  end if;

  update public.budget b
  set prix_moyen = v.pm, revpar = v.revpar, room_revenue = v.ht,
      updated_at = now()
  from (values
    (1, 183541, 100.70, 67.28, 166855),
    (2, 162424, 101.55, 65.92, 147658),
    (3, 205888, 110.10, 75.47, 187171),
    (4, 189771, 98.47, 71.88, 172519),
    (5, 220948, 109.40, 80.99, 200862),
    (6, 308155, 139.79, 116.73, 280141),
    (7, 188269, 94.87, 69.02, 171154),
    (8, 171235, 87.45, 62.77, 155668),
    (9, 269411, 121.97, 102.05, 244919),
    (10, 223413, 110.86, 81.90, 203103),
    (11, 207506, 113.64, 78.60, 188642),
    (12, 172653, 102.19, 63.29, 156957)
  ) v(mois, ttc, pm, revpar, ht)
  where b.year = 2026 and b.month = v.mois and b.room_revenue = v.ttc;

  update public.budget
  set prix_moyen = round(prix_moyen / 1.1, 2),
      revpar = round(revpar / 1.1, 2),
      room_revenue = round(room_revenue / 1.1, 2),
      updated_at = now()
  where year <> 2026;
end
$$;

-- 2. Rapports journaliers ------------------------------------------------------
update public.daily_reports d
set rj_room_revenue = coalesce(b.jour, round(d.rj_room_revenue / 1.1, 2)),
    rmtd_room_revenue = coalesce(b.mois, round(d.rmtd_room_revenue / 1.1, 2)),
    pm_room_revenue = round(d.pm_room_revenue / 1.1, 2)
from public.daily_reports d0
left join lateral (
  select round(m.today, 2) as jour, round(m.mtd, 2) as mois
  from public.pms_daily_metrics m
  where m.report_date = d0.date
    and m.section = 'ROOM REVENUE'
    and m.today is not null and m.mtd is not null
    and abs(d0.rj_room_revenue - round(m.today * 1.1, 2)) <= 0.01
    and abs(d0.rmtd_room_revenue - round(m.mtd * 1.1, 2)) <= 0.01
  limit 1
) b on true
where d.id = d0.id;

update public.daily_reports
set rj_pm = case when rj_nuitees > 0 then round(rj_room_revenue / rj_nuitees, 2) else 0 end,
    rj_revpar = round(rj_room_revenue / 80, 2),
    rmtd_pm = case when rmtd_nuitees > 0 then round(rmtd_room_revenue / rmtd_nuitees, 2) else 0 end,
    rmtd_revpar = case when day_of_month > 0 then round(rmtd_room_revenue / (80 * day_of_month), 2) else 0 end,
    pm_pm = case when pm_nuitees > 0 then round(pm_room_revenue / pm_nuitees, 2) else 0 end,
    pm_revpar = case when days_in_month > 0 then round(pm_room_revenue / (80 * days_in_month), 2) else 0 end;

-- 3. Prévisions --------------------------------------------------------------
-- Comparé au CA réalisé déjà passé en HT (section 2) : rapport du dernier jour
-- du mois, donc mois complet. Un seul rapport par date (contrainte unique).
update public.forecast_days f
set rev_ht = f.rev_ttc
from (
  select fd.year, fd.month
  from public.forecast_days fd
  join public.daily_reports d
    on d.year = fd.year and d.month = fd.month
   and d.day_of_month = d.days_in_month
  group by fd.year, fd.month, d.days_in_month, d.rmtd_room_revenue
  having count(*) = d.days_in_month
     and d.rmtd_room_revenue > 0
     and abs(sum(fd.rev_ttc) - d.rmtd_room_revenue) <= 0.005 * d.rmtd_room_revenue
) m
where f.year = m.year and f.month = m.month;

alter table public.forecast_days rename column adr_ttc to adr_ht;
update public.forecast_days
set adr_ht = case when occ > 0 then round(rev_ht / occ, 2) else 0 end;
alter table public.forecast_days drop column rev_ttc;

comment on column public.forecast_days.rev_ht is 'CA hébergement prévu, HT (colonne REV du Forecast, exporté sans Include Tax depuis le 2026-10-31).';
comment on column public.forecast_days.adr_ht is 'Prix moyen prévu, HT : rev_ht / occ (0 sans occupation).';

-- 4. Fonctions -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repjour_analytique_annuelle(p_annee integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$

  with

  /* Dernier rapport importé de chaque mois. Le TypeScript gardait le PREMIER

     vu d'un tri `day_of_month desc` : rendu explicite. */

  derniers as (

    select distinct on (d.month) d.*

    from daily_reports d

    where d.year = p_annee

    order by d.month, d.day_of_month desc

  ),



  /* Nombre de jours porteurs + surcapacité côté RÉEL. */

  comptes as (

    select d.month,

           count(*)::int as jours,

           bool_or(d.rj_nuitees > 80) as depassement

    from daily_reports d

    where d.year = p_annee

    group by d.month

  ),



  /* Totaux + surcapacité côté PRÉVISION. */

  prevision as (

    /* Sommes rendues BRUTES (`int` et `numeric`), jamais en `double

       precision` : c'est ce qui les fait traverser `jsonb` sans perte. */

    select f.month,

           sum(f.occ)::int as total_occ_brut,

           sum(f.rev_ht) as total_rev_brut,

           count(*)::int as jours,

           bool_or(f.occ > 80) as depassement

    from forecast_days f

    where f.year = p_annee

    group by f.month

  ),



  mois as (

    select

      m.mois,

      l.day_of_month, l.days_in_month,

      l.rmtd_nuitees, l.rmtd_room_revenue,

      l.pm_nuitees, l.pm_to, l.pm_pm, l.pm_revpar, l.pm_room_revenue,

      coalesce(c.jours, 0) as jours_rapport,

      p.total_occ_brut, p.total_rev_brut, coalesce(p.jours, 0) as jours_prevision,

      (coalesce(c.depassement, false) or coalesce(p.depassement, false))

        as depassement,

      /* `days_in_month` de la base, repli calendrier — comme le TypeScript.

         Vérifié : zéro ligne où les deux divergent. */

      coalesce(

        l.days_in_month,

        extract(day from (

          make_date(p_annee, m.mois, 1) + interval '1 month - 1 day'

        ))::int

      )::int as jours_du_mois,

      (l.id is not null and coalesce(c.jours, 0) > 0) as a_rapport

    from generate_series(1, 12) as m(mois)

    left join derniers  l on l.month = m.mois

    left join comptes   c on c.month = m.mois

    left join prevision p on p.month = m.mois

  )



  select jsonb_build_object(



    -- fetchBudgetYears() — années distinctes, CROISSANT. Repli client inchangé.

    'annees', coalesce((

      select jsonb_agg(distinct b.year order by b.year) from budget b

    ), '[]'::jsonb),



    -- fetchYearBudget(annee) — tous les mois, triés.

    'budgets', coalesce((

      select jsonb_agg(to_jsonb(b) order by b.month)

      from budget b where b.year = p_annee

    ), '[]'::jsonb),



    /* fetchYearAnalytics(annee) — TOUJOURS 12 lignes.

     *

     * ⚠ On rend les valeurs BRUTES, pas les indicateurs calculés. Le calcul de

     * `to`, `pm` et `revpar` reste en TypeScript, et c'est délibéré :

     *

     *   1. EXACTITUDE AU BIT PRÈS. `jsonb` n'a pas de type flottant — il range

     *      les nombres en `numeric`. Un `double precision` calculé ici perdrait

     *      ses derniers bits à la sérialisation. Mesuré le 2026-09-23 sur une

     *      première version qui calculait en SQL : 31 écarts sur 108 champs,

     *      tous de l'ordre de 1e-13 (ex. `pm` 112,2842944785276 contre

     *      112,284294478528). Invisibles à l'écran, mais ils interdisaient de

     *      prouver l'équivalence — et une preuve à « presque zéro écart » n'est

     *      pas une preuve.

     *   2. UNE SEULE SOURCE DE VÉRITÉ. Les formules restent à un seul endroit.

     *      `TOTAL_ROOMS` ne se retrouve pas figé dans deux langages.

     *

     * La RPC décide donc de la SOURCE (c'est de la sélection de données, sa

     * raison d'être) et livre les entrées ; le TypeScript garde l'arithmétique.

     */

    'mois', (

      select jsonb_agg(

        case

          -- 1. Rapports présents, mois COMPLET -> réalisé (RMTD).

          when x.a_rapport and x.day_of_month = x.days_in_month then

            jsonb_build_object(

              'month', x.mois, 'source', 'realise',

              'nuitees', x.rmtd_nuitees,

              'revenue', x.rmtd_room_revenue,

              'joursDuMois', x.jours_du_mois::int,

              'daysWithData', x.jours_rapport,

              'hasOvercapacity', x.depassement

            )

          -- 2. Rapports présents, mois INCOMPLET -> projeté (PM, TEL QUEL).

          --    Ces quatre valeurs sont REPRISES sans aucun recalcul.

          when x.a_rapport then

            jsonb_build_object(

              'month', x.mois, 'source', 'projete',

              'nuitees', x.pm_nuitees,

              'revenue', x.pm_room_revenue,

              'pmTo', x.pm_to, 'pmPm', x.pm_pm, 'pmRevpar', x.pm_revpar,

              'joursDuMois', x.jours_du_mois::int,

              'daysWithData', x.jours_rapport,

              'hasOvercapacity', x.depassement

            )

          -- 3. Aucun rapport mais des prévisions.

          when x.jours_prevision > 0 then

            jsonb_build_object(

              'month', x.mois, 'source', 'forecast',

              'nuitees', x.total_occ_brut,

              'revenue', x.total_rev_brut,

              'joursDuMois', x.jours_du_mois::int,

              'daysWithData', x.jours_prevision,

              'hasOvercapacity', x.depassement

            )

          -- 4. Vide. SEULE branche qui force `hasOvercapacity` à false.

          else

            jsonb_build_object(

              'month', x.mois, 'source', 'vide',

              'nuitees', 0, 'revenue', 0,

              'joursDuMois', x.jours_du_mois::int,

              'daysWithData', 0,

              'hasOvercapacity', false

            )

        end

        order by x.mois

      )

      from mois x

    )

  )

$function$;

CREATE OR REPLACE FUNCTION public.repjour_dashboard(p_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with reperes as (
    select
      extract(year  from p_date)::int as an,
      extract(month from p_date)::int as mois
  )
  select jsonb_build_object(

    -- fetchReportByDate(date)
    'rapport', (
      select to_jsonb(d) from daily_reports d where d.date = p_date
    ),

    -- fetchBudget(year, month)
    'budget', (
      select to_jsonb(b) from budget b, reperes r
      where b.year = r.an and b.month = r.mois
    ),

    -- fetchForecastMonthTotal(year, month) — null si AUCUNE prévision du mois.
    'forecastTotal', (
      select case when count(*) = 0 then null else jsonb_build_object(
        'occ', coalesce(sum(f.occ), 0),
        'revHT', coalesce(sum(f.rev_ht), 0)
      ) end
      from forecast_days f, reperes r
      where f.year = r.an and f.month = r.mois
    ),

    -- fetchForecastFreshness(year, month) — les NULL sont ignorés.
    'forecastFraicheur', (
      select max(f.imported_at)
      from forecast_days f, reperes r
      where f.year = r.an and f.month = r.mois and f.imported_at is not null
    ),

    -- fetchLatestReportOfMonth(year, month)
    'dernierDuMois', (
      select to_jsonb(d) from daily_reports d, reperes r
      where d.year = r.an and d.month = r.mois
      order by d.day_of_month desc limit 1
    ),

    -- fetchPreviousReportInMonth(date, year, month) — borné au MÊME mois.
    'rapportPrecedent', (
      select to_jsonb(d) from daily_reports d, reperes r
      where d.year = r.an and d.month = r.mois and d.date < p_date
      order by d.date desc limit 1
    ),

    -- fetchMonthReports(year, month)
    'rapportsDuMois', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.day_of_month)
      from daily_reports d, reperes r
      where d.year = r.an and d.month = r.mois
    ), '[]'::jsonb),

    -- fetchAvailableDates() — plafond explicite, cf. AVAILABLE_DATES_MAX.
    'datesDisponibles', coalesce((
      select jsonb_agg(x.date order by x.date desc)
      from (
        select d.date from daily_reports d
        order by d.date desc limit 5000
      ) x
    ), '[]'::jsonb)
  )
  from reperes;
$function$;

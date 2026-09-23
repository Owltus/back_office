-- ---------------------------------------------------------------------------
-- public.repjour_analytique_annuelle(int) et repjour_analytique_mensuelle(int,int)
-- 2026-09-23
--
-- SYMPTÔME
--   Les deux pages analytiques RepJour font QUATRE allers-retours chacune, et
--   l'annuelle en deux vagues (les années disponibles conditionnent l'année
--   affichée, qui conditionne les données). Relevé du 2026-09-23 en production,
--   préchauffage actif : données prêtes à 2 051 / 1 719 ms (annuel) et
--   1 582 ms (mensuel).
--
-- CAUSE
--   Ni le volume (11,6 Mo de base, 187 lignes dans `daily_reports`) ni la
--   vitesse du SQL, mais le NOMBRE d'allers-retours : ~170 ms pièce une fois la
--   base chaude, jusqu'à 1,37 s à froid.
--
--   Deux gaspillages précis :
--     * `fetchUnifiedDays` fait deux `select('*')` (~30 colonnes) alors que
--       l'affichage en exploite huit ;
--     * `fetchAvailableDates` rapatrie jusqu'à 5 000 dates pour n'en lire
--       QU'UNE — `availableDates.at(-1)`, la plus ancienne, qui sert à griser
--       un chevron (`AnalytiqueMoisBoard.tsx:209-216`). D'où `premiereDate`.
--
-- CORRECTIF
--   Deux fonctions, une par page. L'annuelle renvoie les années DANS sa
--   réponse, ce qui supprime la cascade d'un coup.
--
--   Lectures remplacées :
--     annuelle  : fetchBudgetYears, fetchYearAnalytics (2 requêtes),
--                 fetchYearBudget
--     mensuelle : fetchUnifiedDays (2 requêtes), fetchBudget,
--                 fetchAvailableDates
--
-- SÉCURITÉ — le point à ne pas rater
--   `security invoker` : les RLS de `daily_reports`, `budget` et
--   `forecast_days` s'appliquent à l'APPELANT, exactement comme aujourd'hui. Un
--   compte sans `page:repjour` continue de lire zéro ligne. Ces fonctions ne
--   peuvent rien montrer que l'appelant ne pouvait déjà lire une requête à la
--   fois.
--
--   Ce ne sont donc PAS des « RPC privilégiées » au sens de `CLAUDE.md` : rien
--   à faire dans le schéma `private`, pas de relais. Même nature que
--   `public.repjour_dashboard`.
--
--   `search_path` figé à `public, pg_temp`. `execute` accordé à
--   `authenticated` SEUL, jamais à `anon` ni à PUBLIC.
--
--   `to_jsonb(row)` est employé sur `daily_reports`, `forecast_days` et
--   `budget`, qui ne portent AUCUNE PII nominative. ⚠ Il serait interdit sur
--   `pdj_breakfasts` (`guest_name`, `company`) — voir la décision D6 du
--   chantier, qui vaut pour l'étape PDJ.
--
-- ÉQUIVALENCE — ce qui est reproduit, et pourquoi
--   * ARITHMÉTIQUE EN `double precision`, jamais en `numeric`. Le TypeScript
--     calcule en flottant 64 bits sur des valeurs que PostgREST lui rend en
--     nombres JS ; la division `numeric` de PostgreSQL applique d'autres règles
--     d'échelle et divergerait au centième. Tous les calculs sont donc castés.
--   * TOUJOURS EXACTEMENT 12 MOIS, y compris les mois `'vide'` à zéro. Le
--     tableau de l'UI itère sur le tableau rendu : un mois manquant
--     DISPARAÎTRAIT de l'affichage.
--   * PRIORITÉ DE SOURCE identique : rapports présents ET
--     `day_of_month = days_in_month` -> `realise` (champs `rmtd_*`) ; rapports
--     présents mais mois incomplet -> `projete` (champs `pm_*` repris TELS
--     QUELS, sans recalcul) ; pas de rapport mais prévision -> `forecast` ;
--     sinon `vide`.
--   * « DERNIER JOUR IMPORTÉ » : le TypeScript exploitait le tri
--     `day_of_month desc` en gardant le PREMIER vu. Rendu explicite ici par un
--     `distinct on (month) … order by month, day_of_month desc`. Si ce tri
--     disparaissait, le résultat changerait SILENCIEUSEMENT.
--   * DÉNOMINATEUR : `days_in_month` de la base, avec repli calendrier. Vérifié
--     en base avant écriture : ZÉRO ligne où les deux divergent.
--   * `pm` VAUT 0 ET NON NULL quand `nuitees = 0`, en annuel. (L'équivalent
--     mensuel rend `null` dans le même cas — incohérence PRÉEXISTANTE, laissée
--     telle quelle, cf. `AnalytiqueMoisBoard.tsx:322`.)
--   * `hasOvercapacity` CROISE rapports et prévisions, indépendamment de la
--     source retenue : un mois « réalisé » peut donc être signalé à cause d'une
--     ligne de prévision. Reproduit TEL QUEL (décision du 2026-09-23 : l'hôtel
--     a 80 chambres physiques infranchissables, donc toute valeur au-dessus est
--     une DONNÉE FAUSSE et mérite le même signalement, quelle qu'en soit la
--     source). Seule la branche `vide` force `false`.
--     ⚠ Vérifié en base : AUCUN mois ne dépasse 80 aujourd'hui, ni en réel ni
--     en prévu. Cette branche n'est donc pas exerçable par la preuve
--     d'équivalence sur les données réelles.
--   * TOUS LES JOURS DU MOIS sont générés en mensuel (28 à 31), `report` et
--     `forecast` à `null` quand absents. C'est ce qui garantit que
--     `dailyBudget = budget.room_revenue / rows.length` ne divise JAMAIS par
--     zéro (`AnalytiqueMoisBoard.tsx:126`). Ne rendre que les jours porteurs
--     introduirait une division par zéro.
--   * `budget` absent -> `null` (et non un objet à zéro), comme le
--     `.maybeSingle()` d'origine.
--   * `annees` : années DISTINCTES de la table `budget`, ordre CROISSANT. Le
--     repli `[annéeCourante]` quand la liste est vide reste CÔTÉ COMPOSANT
--     (`AnalytiqueBoard.tsx:63`) : le déplacer ici changerait le contrat.
--
-- INNOCUITÉ
--   Aucune écriture, aucun DDL sur les tables, aucune policy touchée, aucun
--   index créé. `create or replace function` sur deux noms neufs : rien n'est
--   remplacé. Retour arrière = `drop function` ; l'ancien chemin (les six
--   lectures) reste entièrement fonctionnel, ses fonctions restant exportées.
--
-- VÉRIFICATION (après application)
--   select public.repjour_analytique_annuelle(2026) is not null;   -- t
--   select jsonb_array_length(
--     public.repjour_analytique_annuelle(2026) -> 'mois');          -- 12
--   select prosecdef from pg_proc
--    where proname like 'repjour_analytique%';                      -- f, f
--   select has_function_privilege('anon',
--     'public.repjour_analytique_annuelle(int)', 'execute');        -- f
-- ---------------------------------------------------------------------------

begin;

-- ===========================================================================
-- Vue ANNUELLE
-- ===========================================================================
create or replace function public.repjour_analytique_annuelle(p_annee int)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with
  /* 80 chambres physiques — `TOTAL_ROOMS` de `lib/repjour/constants.ts`.
     Figé ici plutôt que lu dans `hotel_config` pour rester strictement
     équivalent au TypeScript remplacé ; à revoir ensemble si l'hôtel change. */
  capacite as (select 80::double precision as chambres),

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
    select f.month,
           sum(f.occ)::double precision as total_occ,
           sum(f.rev_ttc)::double precision as total_rev,
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
      p.total_occ, p.total_rev, coalesce(p.jours, 0) as jours_prevision,
      (coalesce(c.depassement, false) or coalesce(p.depassement, false))
        as depassement,
      /* `days_in_month` de la base, repli calendrier — comme le TypeScript.
         Vérifié : zéro ligne où les deux divergent. */
      coalesce(
        l.days_in_month,
        extract(day from (
          make_date(p_annee, m.mois, 1) + interval '1 month - 1 day'
        ))::int
      )::double precision as jours_du_mois,
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

    -- fetchYearAnalytics(annee) — TOUJOURS 12 lignes.
    'mois', (
      select jsonb_agg(
        case
          -- 1. Rapports présents, mois COMPLET -> réalisé (RMTD).
          when x.a_rapport and x.day_of_month = x.days_in_month then
            jsonb_build_object(
              'month', x.mois,
              'nuitees', x.rmtd_nuitees,
              'revenue', x.rmtd_room_revenue::double precision,
              'to', (x.rmtd_nuitees::double precision
                     / (cap.chambres * x.jours_du_mois)) * 100,
              'pm', case when x.rmtd_nuitees > 0
                         then x.rmtd_room_revenue::double precision
                              / x.rmtd_nuitees
                         else 0 end,
              'revpar', x.rmtd_room_revenue::double precision
                        / (cap.chambres * x.jours_du_mois),
              'daysWithData', x.jours_rapport,
              'source', 'realise',
              'hasOvercapacity', x.depassement
            )
          -- 2. Rapports présents, mois INCOMPLET -> projeté (PM, TEL QUEL).
          when x.a_rapport then
            jsonb_build_object(
              'month', x.mois,
              'nuitees', x.pm_nuitees,
              'to', x.pm_to::double precision,
              'pm', x.pm_pm::double precision,
              'revpar', x.pm_revpar::double precision,
              'revenue', x.pm_room_revenue::double precision,
              'daysWithData', x.jours_rapport,
              'source', 'projete',
              'hasOvercapacity', x.depassement
            )
          -- 3. Aucun rapport mais des prévisions.
          when x.jours_prevision > 0 then
            jsonb_build_object(
              'month', x.mois,
              'nuitees', x.total_occ,
              'revenue', x.total_rev,
              'to', (x.total_occ / (cap.chambres * x.jours_du_mois)) * 100,
              'pm', case when x.total_occ > 0
                         then x.total_rev / x.total_occ else 0 end,
              'revpar', x.total_rev / (cap.chambres * x.jours_du_mois),
              'daysWithData', x.jours_prevision,
              'source', 'forecast',
              'hasOvercapacity', x.depassement
            )
          -- 4. Vide. SEULE branche qui force `hasOvercapacity` à false.
          else
            jsonb_build_object(
              'month', x.mois, 'nuitees', 0, 'to', 0, 'pm', 0, 'revpar', 0,
              'revenue', 0, 'daysWithData', 0, 'source', 'vide',
              'hasOvercapacity', false
            )
        end
        order by x.mois
      )
      from mois x, capacite cap
    )
  )
$$;

comment on function public.repjour_analytique_annuelle(int) is
  'Analytique annuelle RepJour en un seul aller-retour : années disponibles, '
  'douze mois agrégés, budgets. Remplace quatre lectures et supprime une '
  'cascade. security invoker : les RLS s''appliquent à l''appelant.';

revoke all on function public.repjour_analytique_annuelle(int) from public;
revoke all on function public.repjour_analytique_annuelle(int) from anon;
grant execute on function public.repjour_analytique_annuelle(int) to authenticated;

-- ===========================================================================
-- Vue MENSUELLE
-- ===========================================================================
create or replace function public.repjour_analytique_mensuelle(
  p_annee int,
  p_mois  int
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with bornes as (
    select
      make_date(p_annee, p_mois, 1) as premier,
      (make_date(p_annee, p_mois, 1) + interval '1 month - 1 day')::date as dernier
  )
  select jsonb_build_object(

    /* fetchUnifiedDays({annee, mois}) — TOUS les jours du mois, `report` et
       `forecast` à null quand absents. C'est ce qui interdit la division par
       zéro sur `rows.length` côté composant. */
    'jours', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date',     to_char(j.jour, 'YYYY-MM-DD'),
          'month',    p_mois,
          'year',     p_annee,
          'report',   (select to_jsonb(d) from daily_reports d
                        where d.date = j.jour),
          'forecast', (select to_jsonb(f) from forecast_days f
                        where f.date = j.jour)
        )
        order by j.jour
      )
      from bornes b,
           generate_series(b.premier, b.dernier, interval '1 day') as j(jour)
    ), '[]'::jsonb),

    -- fetchBudget(annee, mois) — null si le mois n'a pas de budget.
    'budget', (
      select to_jsonb(b) from budget b
      where b.year = p_annee and b.month = p_mois
    ),

    /* Remplace fetchAvailableDates(), qui rapatriait jusqu'à 5 000 dates pour
       n'en exploiter QU'UNE : la plus ancienne, qui borne le chevron
       « précédent ». `null` si la table est vide — le composant distingue ce
       cas de « en vol ». */
    'premiereDate', (select to_char(min(d.date), 'YYYY-MM-DD') from daily_reports d)
  )
$$;

comment on function public.repjour_analytique_mensuelle(int, int) is
  'Analytique mensuelle RepJour en un seul aller-retour : tous les jours du '
  'mois (rapport + prévision), budget, première date connue. Remplace quatre '
  'lectures. security invoker : les RLS s''appliquent à l''appelant.';

revoke all on function public.repjour_analytique_mensuelle(int, int) from public;
revoke all on function public.repjour_analytique_mensuelle(int, int) from anon;
grant execute on function public.repjour_analytique_mensuelle(int, int) to authenticated;

commit;

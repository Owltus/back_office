-- =============================================================================
-- pdj_daily_agg — le filtre de date doit descendre SOUS l'agrégat
--
-- SYMPTÔME  Les pages qui lisent un mois de `pdj_daily_agg` (analytique PDJ,
--           bande de synthèse RepJour) attendent ~100 ms au mieux, et jusqu'à
--           6 371 ms quand la base est en tension. 4ᵉ requête la plus coûteuse
--           de l'instance : 190 s de CPU pour 187 appels sur 14 jours.
--
-- CAUSE     Le `FULL JOIN` entre les chambres et la recette oblige la vue à
--           exposer `COALESCE(c.service_date, r.service_date)`. Cette
--           expression n'est pas poussable : PostgreSQL agrège donc les 13 512
--           lignes de `pdj_breakfasts`, produit 867 groupes, puis en jette 802
--           pour n'en garder 65. Mesuré à froid le 2026-09-20 :
--             Rows Removed by Filter: 802
--             Seq Scan on pdj_breakfasts ... rows=13512
--             Execution Time: 337 ms
--           Le scan lui-même coûte cher parce que les cinq `upper()` + `LIKE`
--           de la clause CASE sont évalués sur chaque ligne (~70 000 opérations
--           de texte), sur un cœur partagé et saturé.
--
-- CORRECTIF Même résultat, écrit autrement. Le `FULL JOIN` est remplacé par un
--           `UNION ALL` de ses deux moitiés :
--             1. les chambres, en LEFT JOIN sur la recette ;
--             2. les recettes SANS chambre correspondante.
--           `service_date` devient alors une colonne simple de chaque branche,
--           et non plus une expression. Le prédicat descend dans les deux, puis
--           sous le GROUP BY de la branche 1 (c'est une colonne de groupement).
--           Les deux CTE sont `not materialized` : sans ça PostgreSQL les
--           matérialise — elles sont référencées deux fois — et le filtre reste
--           bloqué au-dessus.
--           Le `NOT EXISTS` de la branche 2 interroge `pdj_breakfasts`
--           directement plutôt que l'agrégat : il évite ainsi un second calcul
--           complet, et se sert de l'index sur `service_date`.
--
-- INNOCUITÉ `create or replace view` ne touche AUCUNE donnée, ne supprime
--           rien et préserve les droits ainsi que `security_invoker=true`
--           (réaffirmé ci-dessous par prudence). L'équivalence a été PROUVÉE
--           avant application, en lecture seule, par une double différence
--           d'ensembles (`except all` dans les deux sens) sur la totalité des
--           867 lignes : 0 en trop, 0 manquante.
--
-- MESURE    Trois passes alternées sur une fenêtre d'un mois, le 2026-09-20 :
--             actuelle : 203 / 99 / 98 ms   — Rows Removed by Filter: 802
--             nouvelle :  67 / 10 / 10 ms   — Rows Removed by Filter: 4
--
-- RETOUR    L'ancienne définition reste dans `supabase/pdj_daily_agg.sql` et
--   ARRIÈRE ses deux compléments du 2026-09-12. Les rejouer dans l'ordre
--           restaure l'état antérieur.
--
-- ⚠ Cette vue est désormais l'AUTORITÉ de `pdj_daily_agg`. Les trois fichiers
--   précédents portent « REMPLACÉ — NE PLUS REJOUER » : un fichier de vue
--   rejoué par inadvertance est exactement ce qui a produit le « revert
--   silencieux » des policies du 2026-08-04.
-- =============================================================================

create or replace view public.pdj_daily_agg as
with chambres as not materialized (
  select t.service_date, t.code,
    count(*)::integer as rooms,
    coalesce(sum(t.guests), 0::bigint)::integer as guests,
    coalesce(sum(t.breakfasts_included), 0::bigint)::integer as included,
    coalesce(sum(t.breakfasts_served), 0::bigint)::integer as served,
    coalesce(sum(greatest(t.breakfasts_served - t.breakfasts_included, 0)), 0::bigint)::integer as extra,
    coalesce(sum(greatest(t.breakfasts_included - t.breakfasts_served, 0)), 0::bigint)::integer as no_show,
    coalesce(sum(
      case
        when t.staff then t.breakfasts_served::integer
        when t.manual_kind = 'offert'::text then t.breakfasts_served::integer
        else least(t.breakfasts_offert::integer, greatest(t.breakfasts_served - t.breakfasts_included, 0))
      end), 0::bigint)::integer as offert
  from (
    select pdj_breakfasts.service_date, pdj_breakfasts.guests,
      case when upper(coalesce(pdj_breakfasts.rate_plan, ''::text)) like '%STAFF%'::text then 0
           else pdj_breakfasts.breakfasts_included::integer end as breakfasts_included,
      pdj_breakfasts.breakfasts_served, pdj_breakfasts.breakfasts_offert,
      pdj_breakfasts.manual_kind,
      upper(coalesce(pdj_breakfasts.rate_plan, ''::text)) like '%STAFF%'::text as staff,
      case
        when upper(coalesce(pdj_breakfasts.rate_plan, ''::text)) like '%STAFF%'::text then null::text
        when upper(coalesce(pdj_breakfasts.addons, ''::text)) like '%PDJGROUP%'::text then 'PDJGROUP10'::text
        when upper(coalesce(pdj_breakfasts.addons, ''::text)) like '%PDJBB%'::text then 'PDJBB'::text
        when upper(coalesce(pdj_breakfasts.addons, ''::text)) like '%PDJ%'::text then 'PDJ'::text
        when pdj_breakfasts.manual_kind = 'inclus'::text then 'PDJ'::text
        else null::text
      end as code
    from pdj_breakfasts) t
  group by t.service_date, t.code
), recette as not materialized (
  select pdj_addon_production.service_date, pdj_addon_production.code,
         pdj_addon_production.revenue_ttc
  from pdj_addon_production
)
select c.service_date, c.code, c.rooms, c.guests, c.included, c.served,
         c.extra, c.no_show, c.offert, r.revenue_ttc
  from chambres c
  left join recette r on r.service_date = c.service_date and r.code = c.code
  union all
  select r.service_date, r.code, 0, 0, 0, 0, 0, 0, 0, r.revenue_ttc
  from recette r
  where not exists (
    select 1 from pdj_breakfasts b
    where b.service_date = r.service_date
      and (case
        when upper(coalesce(b.rate_plan, ''::text)) like '%STAFF%'::text then null::text
        when upper(coalesce(b.addons, ''::text)) like '%PDJGROUP%'::text then 'PDJGROUP10'::text
        when upper(coalesce(b.addons, ''::text)) like '%PDJBB%'::text then 'PDJBB'::text
        when upper(coalesce(b.addons, ''::text)) like '%PDJ%'::text then 'PDJ'::text
        when b.manual_kind = 'inclus'::text then 'PDJ'::text
        else null::text
      end) is not distinct from r.code);

alter view public.pdj_daily_agg set (security_invoker = true);

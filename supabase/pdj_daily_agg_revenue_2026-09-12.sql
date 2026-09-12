-- =============================================================================
-- pdj_daily_agg — la recette RÉELLE du PMS entre dans l'agrégat
--
-- Application : `supabase db query --linked -f supabase/pdj_daily_agg_revenue_2026-09-12.sql`
-- Idempotent (`create or replace view`). Aucune donnée écrite, aucune policy
-- modifiée, aucune colonne existante retirée : purement additif.
--
-- POURQUOI (plan du 2026-09-12)
--
-- Le chiffre d'affaires du petit-déjeuner était RECONSTITUÉ côté client :
-- couverts × prix DEVINÉ (`detectUnitPrice`). Ce prix n'étant écrit nulle part,
-- il était déduit du fait que les recettes sont des multiples du prix unitaire —
-- et une remise de 8 € le 2026-09-12 a suffi à le faire tomber de 19 € à 1 €,
-- divisant par dix-neuf tout le CA affiché, sur tout l'historique.
--
-- Or le PMS transmet chaque jour ce qu'il a facturé, par code
-- (`pdj_addon_production.revenue_ttc`). Neuf mois d'historique confirment que
-- cette recette correspond EXACTEMENT aux petits-déjeuners INCLUS (corrélation
-- 0,994, écart cumulé 0,1 %). Le CA se lit donc au lieu de se deviner.
--
-- L'analytique (annuelle, mensuelle) et les moyennes/jour du board lisent cette
-- vue, et NON la table : sans cette colonne, elles resteraient sur l'ancien
-- calcul pendant que le board afficherait le bon chiffre — deux vérités pour la
-- même journée. D'où cette évolution.
--
-- FULL JOIN, et pas LEFT : 13 jours d'historique portent une recette SANS aucune
-- ligne In-House (import de rooming raté, 7 170 € au total), et 20 jours au
-- total ont une recette sur un code qu'aucune chambre ne porte (un groupe
-- facturé en bloc, par exemple). Un LEFT JOIN depuis les chambres perdrait ces
-- recettes — elles existent pourtant. À l'inverse, un jour
-- de chambres sans recette reste présent avec `revenue_ttc = null`, ce que le
-- client distingue d'un zéro (`billed`) pour ne pas afficher « 0 € » quand la
-- réponse honnête est « on ne sait pas ».
--
-- `security_invoker` conservé : la RLS des deux tables sous-jacentes continue de
-- s'appliquer, page:pdj de part et d'autre.
-- =============================================================================

create or replace view public.pdj_daily_agg
with (security_invoker = true) as
with chambres as (
  select
    service_date,
    code,
    count(*)::int                                                    as rooms,
    coalesce(sum(guests), 0)::int                                    as guests,
    coalesce(sum(breakfasts_included), 0)::int                       as included,
    coalesce(sum(breakfasts_served), 0)::int                         as served,
    coalesce(sum(greatest(breakfasts_served - breakfasts_included, 0)), 0)::int
                                                                     as extra,
    coalesce(sum(greatest(breakfasts_included - breakfasts_served, 0)), 0)::int
                                                                     as no_show,
    coalesce(sum(
      case
        when manual_kind = 'offert' then breakfasts_served
        else least(breakfasts_offert, greatest(breakfasts_served - breakfasts_included, 0))
      end
    ), 0)::int                                                       as offert
  from (
    select
      service_date,
      guests,
      breakfasts_included,
      breakfasts_served,
      breakfasts_offert,
      manual_kind,
      case
        when upper(coalesce(addons, '')) like '%PDJGROUP%' then 'PDJGROUP10'
        when upper(coalesce(addons, '')) like '%PDJBB%'    then 'PDJBB'
        when upper(coalesce(addons, '')) like '%PDJ%'      then 'PDJ'
        when manual_kind = 'inclus'                        then 'PDJ'
        else null
      end as code
    from public.pdj_breakfasts
  ) t
  group by service_date, code
),
recette as (
  -- Une ligne par (jour, code) : la clé est unique en base.
  select service_date, code, revenue_ttc
  from public.pdj_addon_production
)
select
  coalesce(c.service_date, r.service_date)                           as service_date,
  coalesce(c.code, r.code)                                           as code,
  coalesce(c.rooms, 0)                                               as rooms,
  coalesce(c.guests, 0)                                              as guests,
  coalesce(c.included, 0)                                            as included,
  coalesce(c.served, 0)                                              as served,
  coalesce(c.extra, 0)                                               as extra,
  coalesce(c.no_show, 0)                                             as no_show,
  coalesce(c.offert, 0)                                              as offert,
  -- Recette TTC facturée par le PMS pour ce (jour, code). `null` = aucune
  -- facturation reçue : le client affiche alors une ESTIMATION au prix de
  -- référence, jamais un zéro muet. Le bucket `code is null` (chambres sans
  -- petit-déjeuner) n'a évidemment aucune recette.
  r.revenue_ttc                                                      as revenue_ttc
from chambres c
full join recette r
  on r.service_date = c.service_date and r.code = c.code;

-- Lecture de la vue pour les sessions authentifiées (la RLS des tables
-- sous-jacentes s'applique de toute façon, page:pdj).
grant select on public.pdj_daily_agg to authenticated;

-- =============================================================================
-- VÉRIFICATION (lecture seule)
-- =============================================================================
select 'colonne revenue_ttc presente' as controle, count(*)::text as valeur
from information_schema.columns
where table_schema = 'public' and table_name = 'pdj_daily_agg'
  and column_name = 'revenue_ttc'
union all
select 'vue toujours security_invoker (attendu true)',
       coalesce((select 'true' from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = 'pdj_daily_agg'
                   and 'security_invoker=true' = any(c.reloptions)), 'NON')
union all
select 'lignes de la vue (>= lignes chambres)', count(*)::text
from public.pdj_daily_agg
union all
select 'recette totale de la vue = recette de la table (attendu 0 ecart)',
       (coalesce((select sum(revenue_ttc) from public.pdj_daily_agg), 0)
        - coalesce((select sum(revenue_ttc) from public.pdj_addon_production), 0))::text
union all
select 'jours avec recette mais sans chambre porteuse (20 mesures le 2026-09-12)',
       count(distinct service_date)::text
from public.pdj_daily_agg
where rooms = 0 and revenue_ttc is not null
union all
select 'inclus totaux inchanges',
       coalesce(sum(included), 0)::text
from public.pdj_daily_agg;

-- =============================================================================
-- pdj_daily_agg — le petit-déjeuner STAFF vaut 0 €, coché ou non
--
-- Application : `supabase db query --linked -f supabase/pdj_daily_agg_staff_2026-09-12.sql`
-- Idempotent (`create or replace view`). Aucune donnée écrite, aucune policy
-- modifiée, aucune colonne retirée : seule la définition de la vue change.
--
-- POURQUOI
--
-- Un membre du personnel logé à l'hôtel occupe une chambre dont le plan
-- tarifaire porte « STAFF » : « GRATUITE - STAFF » (24 nuits), « TARIF STAFF –
-- 1 PDJ » (2) ou « TARIF STAFF – CH SEULE » (11). Aucune de ces lignes ne porte
-- d'addon PDJ, donc `breakfasts_included` y vaut 0 — mais la case EST cochée
-- quand la personne descend prendre son petit-déjeuner.
--
-- Sans règle, ce servi sans inclus se lit comme un EXTRA et se valorise au prix
-- fort : ce matin, la chambre 503 (« TARIF STAFF – 1 PDJ », deux cases cochées)
-- ajoutait 34,54 € HT au chiffre d'affaires d'une journée où l'hôtel n'avait
-- rien facturé pour elle. Décision de l'utilisateur le 2026-09-12 : un
-- petit-déjeuner STAFF vaut 0 €, que la case soit cochée ou non — même
-- traitement qu'un « offert ».
--
-- La vue doit porter la règle en plus du client : l'analytique (annuelle,
-- mensuelle) et la bande du rapport journalier lisent la vue, et NON la table.
-- Sans cette modification, la page PDJ afficherait 0 € pour le staff pendant que
-- l'analytique le facturerait — deux vérités pour la même journée.
--
-- DEUX EFFETS, tous deux voulus :
--   1. `offert` compte désormais tout le servi d'une nuit STAFF → l'extra
--      correspondant sort du chiffre d'affaires (le client calcule
--      `extra - offert`), et la case s'affiche en violet, comme une gratuité ;
--   2. `code` est forcé à null et `included` à 0 sur une nuit STAFF : par
--      construction, une telle ligne ne peut plus entrer dans un cumul d'inclus
--      ni dans le taux de captage, même si un futur import lui attachait un
--      addon PDJ par erreur.
--
-- `security_invoker` conservé : la RLS de `pdj_breakfasts` continue de
-- s'appliquer (page:pdj). La colonne `revenue_ttc` ajoutée le 2026-09-12 est
-- reprise telle quelle.
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
        -- Nuit STAFF : tout le servi est gratuit, sans condition.
        when staff                  then breakfasts_served
        when manual_kind = 'offert' then breakfasts_served
        else least(breakfasts_offert, greatest(breakfasts_served - breakfasts_included, 0))
      end
    ), 0)::int                                                       as offert
  from (
    select
      service_date,
      guests,
      -- Une nuit STAFF ne doit jamais peser dans un cumul d'inclus.
      case when upper(coalesce(rate_plan, '')) like '%STAFF%'
           then 0 else breakfasts_included end                       as breakfasts_included,
      breakfasts_served,
      breakfasts_offert,
      manual_kind,
      upper(coalesce(rate_plan, '')) like '%STAFF%'                  as staff,
      case
        when upper(coalesce(rate_plan, '')) like '%STAFF%' then null
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
  -- facturation reçue : le client affiche alors une ESTIMATION au prix de la
  -- carte, jamais un zéro muet.
  r.revenue_ttc                                                      as revenue_ttc
from chambres c
full join recette r
  on r.service_date = c.service_date and r.code = c.code;

grant select on public.pdj_daily_agg to authenticated;

-- =============================================================================
-- VÉRIFICATION (lecture seule)
-- =============================================================================
select 'colonne revenue_ttc toujours presente' as controle, count(*)::text as valeur
from information_schema.columns
where table_schema = 'public' and table_name = 'pdj_daily_agg'
  and column_name = 'revenue_ttc'
union all
select 'vue toujours security_invoker (attendu true)',
       coalesce((select 'true' from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = 'pdj_daily_agg'
                   and 'security_invoker=true' = any(c.reloptions)), 'NON')
union all
select 'recette totale inchangee (attendu 0 ecart)',
       (coalesce((select sum(revenue_ttc) from public.pdj_daily_agg), 0)
        - coalesce((select sum(revenue_ttc) from public.pdj_addon_production), 0))::text
union all
select 'nuits STAFF en base (37 mesurees le 2026-09-12)',
       count(*)::text
from public.pdj_breakfasts
where upper(coalesce(rate_plan, '')) like '%STAFF%'
union all
select 'couverts STAFF servis, desormais tous offerts',
       coalesce(sum(breakfasts_served), 0)::text
from public.pdj_breakfasts
where upper(coalesce(rate_plan, '')) like '%STAFF%'
union all
select 'aucun inclus porte par une nuit STAFF (attendu 0)',
       coalesce(sum(breakfasts_included), 0)::text
from public.pdj_breakfasts
where upper(coalesce(rate_plan, '')) like '%STAFF%'
union all
select 'jours ou offert depasse extra, incoherent (attendu 0)',
       count(*)::text
from public.pdj_daily_agg
where offert > extra;

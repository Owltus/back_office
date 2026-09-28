-- =============================================================================
-- REMPLACÉ — NE PLUS REJOUER (bannière posée le 2026-09-28, revue des rejeux).
-- Pourquoi : son `create or replace view public.pdj_daily_agg` porte une
-- définition ANCIENNE (sans revenue_ttc, sans STAFF à 0 €, sans la réécriture
-- UNION ALL du 2026-09-20). Rejoué, il échouerait (colonnes de vue retirées)
-- ou ramènerait l'agrégat à l'ancienne forme (CA faux, 98 ms au lieu de 11) ;
-- son `grant` est aussi celui d'avant perf_audit_2026-09-06.sql. La colonne
-- breakfasts_offert et le CHECK manual_kind sont déjà en prod. Fait autorité
-- pour la vue : pdj_daily_agg_pushdown_2026-09-20.sql. « Ré-exécutable » plus
-- bas n'est plus vrai. Conservé pour l'historique.
-- =============================================================================

-- =============================================================================
-- pdj_breakfasts — statut « offert » (petit-déjeuner gratuit, geste commercial)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
--
-- BUT : un petit-déjeuner « offert » reste compté comme SERVI (stats, cases
-- cochées, taux de captage) mais ne doit JAMAIS entrer dans le CA facturé
-- (cf. computePdjCA / roomFinance / pdjRoomBreakdown, src/lib/pdj/breakdown.ts).
--
-- Deux chemins, selon le type de ligne (posés par le board, clic droit / bouton) :
--   - ligne D'IMPORT (chambre occupée SANS PDJ inclus, `manual_kind IS NULL`) :
--     `breakfasts_offert` compte, PARMI les extras servis (`breakfasts_served −
--     breakfasts_included`), combien sont offerts — posé par clic droit sur la
--     case, à l'écran ;
--   - ligne MANUELLE (day-use / chambre vide, `manual_kind`) : `manual_kind =
--     'offert'` vaut pour TOUTE la ligne (comme 'extra', mais gratuit) —
--     `breakfasts_offert` reste à 0 pour ces lignes, inutile.
--
-- NON DESTRUCTEUR : nouvelle colonne (défaut 0) + élargissement d'une contrainte
-- CHECK existante. N'affecte aucune ligne déjà en base (0 offert par défaut).
-- =============================================================================

-- ---- Colonne + garde-fou ------------------------------------------------------
alter table public.pdj_breakfasts
  add column if not exists breakfasts_offert smallint not null default 0;

alter table public.pdj_breakfasts
  drop constraint if exists pdj_breakfasts_breakfasts_offert_check;
alter table public.pdj_breakfasts
  add constraint pdj_breakfasts_breakfasts_offert_check check (breakfasts_offert >= 0);

-- ---- Élargit le statut manuel existant ('inclus' | 'extra') à 'offert' -------
alter table public.pdj_breakfasts
  drop constraint if exists pdj_breakfasts_manual_kind_check;
alter table public.pdj_breakfasts
  add constraint pdj_breakfasts_manual_kind_check
    check (manual_kind is null or manual_kind in ('inclus', 'extra', 'offert'));

-- ---- Vue d'agrégation (pdj_daily_agg) : ajoute la colonne `offert` -----------
-- Remplace la définition de supabase/pdj_daily_agg.sql (tenue à jour en miroir,
-- cf. ce fichier) : sans cette colonne, les moyennes/jour et l'analytique
-- resteraient calculées SANS déduire les offerts (petit écart de CA historique).
-- security_invoker inchangé : la RLS de la table sous-jacente s'applique toujours.
create or replace view public.pdj_daily_agg
with (security_invoker = true) as
select
  service_date,
  code,
  count(*)::int                                                      as rooms,
  coalesce(sum(guests), 0)::int                                      as guests,
  coalesce(sum(breakfasts_included), 0)::int                         as included,
  coalesce(sum(breakfasts_served), 0)::int                           as served,
  coalesce(sum(greatest(breakfasts_served - breakfasts_included, 0)), 0)::int
                                                                     as extra,
  coalesce(sum(greatest(breakfasts_included - breakfasts_served, 0)), 0)::int
                                                                     as no_show,
  coalesce(sum(
    case
      when manual_kind = 'offert' then breakfasts_served
      else least(breakfasts_offert, greatest(breakfasts_served - breakfasts_included, 0))
    end
  ), 0)::int                                                         as offert
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
group by service_date, code;

grant select on public.pdj_daily_agg to authenticated;

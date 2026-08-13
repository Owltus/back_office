-- =============================================================================
-- pdj_daily_agg — VUE d'agrégation « un jour × un code » des petits-déjeuners
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
--
-- BUT (performance) : les vues analytique + les moyennes/jour du board lisaient
-- la table `pdj_breakfasts` ENTIÈRE (une ligne par chambre-jour, ~11 700 lignes
-- et croissant) puis réduisaient en JS. Cette vue pré-agrège côté base, par
-- (jour de service, code petit-déjeuner) → quelques centaines de lignes au total.
-- Le board (grille du jour, cochage live) NE passe PAS par cette vue : il garde
-- `fetchDay` (une lecture indexée d'un seul jour) et l'écriture directe des cases.
--
-- security_invoker = true : la vue s'exécute avec les DROITS DE L'APPELANT, donc
-- la RLS de `pdj_breakfasts` s'applique telle quelle (un compte sans permission de
-- lecture PDJ voit 0 ligne à travers la vue, comme aujourd'hui via fetchDay). La
-- vue n'expose AUCUNE donnée nominative (que des comptes/sommes).
--
-- Code petit-déjeuner : réplique EXACTE de `breakfastCode` (src/lib/pdj/breakdown.ts)
--   PDJGROUP → PDJBB → PDJ, PLUS `manual_kind = 'inclus'` → 'PDJ' (day-use inclus,
--   absent de `addons`). Les lignes sans PDJ tombent dans un bucket `code = null`
--   (elles portent quand même chambres/clients/servis → extras walk-in comptés).
--
-- extra / no_show sont sommés PAR CHAMBRE (greatest(...,0) AVANT somme) : c'est ce
-- que fait le JS ligne à ligne. On ne peut donc PAS les recalculer depuis les
-- totaux du jour — d'où leur présence dans la vue.
-- =============================================================================

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
                                                                     as no_show
from (
  select
    service_date,
    guests,
    breakfasts_included,
    breakfasts_served,
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

-- Lecture de la vue pour les sessions authentifiées (la RLS de la table sous-jacente
-- fait le vrai filtrage, security_invoker oblige). `anon` n'est PAS servi (cohérent
-- avec le durcissement : aucune lecture anonyme).
grant select on public.pdj_daily_agg to authenticated;

-- =============================================================================
-- Realtime — diffuser les changements de `pdj_breakfasts` aux clients abonnés.
--
-- Le board /pdj s'abonne aux INSERT/UPDATE/DELETE du JOUR affiché (filtre
-- service_date côté serveur) pour que le cochage d'une case soit vu EN DIRECT par
-- les autres utilisateurs, sans rafraîchir la page. La RLS s'applique aussi au
-- realtime (chacun ne reçoit que ce qu'il a le droit de lire).
-- (Bloc idempotent : ne casse pas si la table est déjà dans la publication.)
-- =============================================================================
do $$
begin
  alter publication supabase_realtime add table public.pdj_breakfasts;
exception
  when duplicate_object then null;
end
$$;

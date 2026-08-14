-- =============================================================================
-- rapro_daily_agg — VUE d'agrégation du récap ménage (facturable ELIOR)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
--
-- BUT (performance) : l'analytique ANNUEL lançait 12 requêtes (une par mois), le
-- mensuel et la bande RepJour scannaient les lignes de `rapro_rooms` puis les
-- réduisaient en JS. On pré-agrège côté base : une ligne par JOUR CLÔTURÉ, avec les
-- décomptes par statut. Le board `/rapro` (saisie jour par jour) n'est PAS concerné.
--
-- security_invoker = true : la vue s'exécute avec les droits de l'appelant → la RLS
-- de `rapro_rooms` ET de `rapro_sheets` s'applique (un compte sans droit rapro ne
-- voit rien). Aucune donnée nominative (rien que des comptes).
--
-- SEULS LES JOURS CLÔTURÉS COMPTENT : le JOIN sur `rapro_sheets` (status =
-- 'validated') exclut les brouillons, exactement comme l'ancien
-- `fetchStatusCountsByRange` (via `fetchValidatedDays`). Catégories identiques à la
-- grille : nettoyee (vente facturée) / rattrapage (reportée non vendue, facturable)
-- / bloquee (= non_nettoyee) / refus (hors charge).
-- =============================================================================

create or replace view public.rapro_daily_agg
with (security_invoker = true) as
select
  r.report_date::text                                    as report_date,
  count(*) filter (where r.status = 'nettoyee')::int     as nettoyee,
  count(*) filter (where r.status = 'rattrapage')::int   as rattrapage,
  count(*) filter (where r.status = 'non_nettoyee')::int as bloquee,
  count(*) filter (where r.status = 'refus')::int        as refus
from public.rapro_rooms r
join public.rapro_sheets s
  on s.report_date = r.report_date
  and s.status = 'validated'
where r.status in ('nettoyee', 'rattrapage', 'non_nettoyee', 'refus')
group by r.report_date;

grant select on public.rapro_daily_agg to authenticated;

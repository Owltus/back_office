-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- Table NOUVELLE, indépendante des tables repjour partagées (lecture seule).
--
-- Toutes les lignes du CSV « Comparison By Date », converties en données —
-- aucun fichier n'est stocké. Une ligne du CSV = une ligne ici, pour la date du
-- rapport (J-1 du nom de fichier, cf. lib/repjour/parse/date.ts) : `report_date`
-- se joint donc directement à `daily_reports.date`.
--
-- Pourquoi TOUT stocker plutôt que quelques colonnes typées : le CSV porte des
-- dizaines de postes (revenus, TVA, taxe de séjour, modes de paiement…) dont
-- l'app n'exploite aujourd'hui qu'une poignée. Les capturer coûte le même import
-- et les rend croisables par n'importe quelle page (rapprochement, caisse, PDJ).
--
-- `line_no` (rang dans le fichier) fait partie de la clé car les libellés NE SONT
-- PAS uniques : « Petit-déjeuner inclus » apparaît 2×, « Petit-déjeuner Groupe »
-- 3×. Une clé (report_date, section) écraserait silencieusement ces lignes.
--
-- `raw` conserve les valeurs telles qu'écrites par le PMS (« 92.50% », « 82 / 0 »)
-- que les colonnes numériques ne peuvent pas représenter : aucune perte.

create table if not exists public.pms_daily_metrics (
  id            uuid primary key default gen_random_uuid(),
  report_date   date not null,              -- date des données (= J-1 du fichier)
  line_no       int  not null,              -- rang dans le CSV (libellés non uniques)
  section       text not null,              -- libellé brut, ex. 'No Show Rooms'
  today         numeric,                    -- null si non numérique (voir `raw`)
  mtd           numeric,
  last_year_mtd numeric,
  mtd_variance  numeric,
  ytd           numeric,
  last_year_ytd numeric,
  ytd_variance  numeric,
  raw           jsonb not null default '{}'::jsonb,
  imported_by   uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (report_date, line_no)             -- clé d'upsert de l'import
);

-- Lecture par libellé (« donne-moi le no-show du 8 juillet ») : le cas d'usage
-- de loin le plus fréquent, et le seul chemin utilisé par le rapprochement.
create index if not exists pms_daily_metrics_date_section
  on public.pms_daily_metrics (report_date, section);

-- Fonction trigger générique (déjà déployée avec rapro_rooms ; idempotente).
create or replace function public.rapro_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pms_daily_metrics_set_updated_at on public.pms_daily_metrics;
create trigger pms_daily_metrics_set_updated_at
  before update on public.pms_daily_metrics
  for each row execute function public.rapro_set_updated_at();

-- RLS : lecture pour tout authentifié, écriture réservée aux rôles qui importent.
alter table public.pms_daily_metrics enable row level security;

drop policy if exists "pms_daily_metrics read (authenticated)" on public.pms_daily_metrics;
create policy "pms_daily_metrics read (authenticated)"
  on public.pms_daily_metrics for select
  to authenticated using (true);

drop policy if exists "pms_daily_metrics insert (super/admin)" on public.pms_daily_metrics;
create policy "pms_daily_metrics insert (super/admin)"
  on public.pms_daily_metrics for insert
  to authenticated
  with check (get_user_role() in ('super_utilisateur', 'admin'));

drop policy if exists "pms_daily_metrics update (super/admin)" on public.pms_daily_metrics;
create policy "pms_daily_metrics update (super/admin)"
  on public.pms_daily_metrics for update
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'))
  with check (get_user_role() in ('super_utilisateur', 'admin'));

-- Delete : un réimport d'un fichier plus court doit pouvoir purger les lignes
-- surnuméraires de la même date (voir services/metrics.ts).
drop policy if exists "pms_daily_metrics delete (super/admin)" on public.pms_daily_metrics;
create policy "pms_daily_metrics delete (super/admin)"
  on public.pms_daily_metrics for delete
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'));

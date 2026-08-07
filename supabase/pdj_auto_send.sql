-- =============================================================================
-- pdj_auto_send_log — garde d'idempotence de l'ENVOI AUTOMATIQUE du PDJ.
--
-- CONTEXTE : après l'import automatique du rapport In-House (Edge Function
-- import-report), la feuille de petit-déjeuner du jour est envoyée par e-mail
-- (Resend) UNE seule fois. Contrairement au RepJour (colonne auto_sent_at sur la
-- ligne unique daily_reports), le PDJ n'a pas de ligne unique par jour
-- (pdj_breakfasts est indexé par (service_date, room)) : on utilise donc une
-- petite table-journal, une ligne par jour envoyé.
--
-- RÉSERVATION ATOMIQUE (côté fonction) :
--     insert into pdj_auto_send_log(service_date) values (:d)
--     on conflict (service_date) do nothing returning service_date;
-- Deux invocations quasi simultanées n'insèrent qu'une fois → un seul envoi.
-- L'envoi MANUEL (bouton admin) N'utilise PAS ce journal (renvoi toujours permis).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- NON DESTRUCTIF : crée une table + RLS. Aucune donnée existante touchée.
--
-- SÉCURITÉ : écrite/lue UNIQUEMENT par import-report en service_role (bypass RLS).
-- RLS activée SANS policy → aucun accès pour `authenticated`/`anon` (rien à y lire
-- côté client). Le service_role contourne la RLS.
-- =============================================================================

create table if not exists public.pdj_auto_send_log (
  service_date date primary key,
  sent_at      timestamptz not null default now()
);

alter table public.pdj_auto_send_log enable row level security;

-- Purge dynamique d'éventuelles policies (on ne veut AUCUN accès client).
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'pdj_auto_send_log'
  loop
    execute format('drop policy if exists %I on public.pdj_auto_send_log', r.policyname);
  end loop;
end $$;

-- =============================================================================
-- Vérification (lecture seule) après exécution :
--   1) La table existe, RLS activée, 0 policy :
--      select relrowsecurity from pg_class where relname='pdj_auto_send_log';   -- t
--      select count(*) from pg_policies
--      where schemaname='public' and tablename='pdj_auto_send_log';            -- 0
--   2) Un compte authentifié (JWT direct) : select * ... ; -- attendu : 0 ligne / refus
-- =============================================================================

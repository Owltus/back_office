-- =============================================================================
-- report_send_throttle — anti-spam de l'envoi serveur (Resend, Edge Function
-- send-report). Mémorise le DERNIER envoi PAR UTILISATEUR ; la fonction refuse un
-- nouvel envoi avant la fin du cooldown (admin : 5 min ; éditeur/gestionnaire :
-- 15 min). Enforcement 100 % serveur → non contournable côté client.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- NON DESTRUCTIF : crée une table. Ne touche à aucune donnée existante.
--
-- ACCÈS : exclusivement via l'Edge Function (clé service_role, bypass RLS). AUCUNE
-- policy → aucun compte authenticated/anon ne peut lire ni écrire directement
-- (défaut fermé). C'est voulu : ce n'est pas une donnée métier exposée à l'app.
-- =============================================================================

create table if not exists public.report_send_throttle (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  last_sent_at timestamptz not null default now()
);

alter table public.report_send_throttle enable row level security;

-- Purge dynamique d'éventuelles policies héritées puis AUCUNE recréation : la
-- table reste inaccessible en direct (seul service_role, qui bypass la RLS, écrit).
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'report_send_throttle'
  loop
    execute format('drop policy if exists %I on public.report_send_throttle', r.policyname);
  end loop;
end $$;

-- =============================================================================
-- Vérification (lecture seule) :
--   select relrowsecurity from pg_class where relname = 'report_send_throttle';
--     -> attendu : true
--   select count(*) from pg_policies
--     where schemaname='public' and tablename='report_send_throttle';
--     -> attendu : 0 (accès service_role uniquement)
-- =============================================================================

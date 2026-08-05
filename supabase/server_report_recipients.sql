-- =============================================================================
-- server_report_recipients — destinataires DÉDIÉS à l'envoi serveur (Resend, via
-- l'Edge Function send-report). Liste INDÉPENDANTE de `email_recipients` (qui,
-- elle, sert au bouton « Envoyer par email » / mailto).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- NON DESTRUCTIF : crée une table + ses policies. Ne touche à aucune donnée
-- existante et ne modifie pas `email_recipients`.
--
-- MODÈLE DE SÉCURITÉ (identique à email_recipients_rls_hardening) :
--   - LECTURE : tout compte ayant la page RepJour (n'importe quel niveau). La
--     modale de gestion est admin-only côté UI, mais la lecture reste ouverte au
--     niveau « page RepJour » par cohérence (aucune donnée confidentielle : ce
--     sont des adresses de diffusion interne).
--   - ÉCRITURE (insert/update/delete) : niveau « gestion » uniquement.
--   - L'Edge Function send-report lit CÔTÉ SERVEUR avec la clé service_role
--     (bypass RLS) et exige déjà profiles.role = 'admin' : ces policies ne
--     bloquent pas l'envoi.
--
-- PRÉREQUIS : page_permissions.sql exécuté (is_admin / page_level_rank /
-- get_page_level existent et sont grantées à authenticated).
-- =============================================================================

create table if not exists public.server_report_recipients (
  id         bigint generated always as identity primary key,
  email      text not null,
  name       text not null default '',
  type       text not null default 'to' check (type in ('to', 'cc')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  -- Même classe de caractères que email_recipients : exclut espaces et
  -- ? & # ; , < > " — hygiène d'adresse (la validation cliente double ce CHECK,
  -- qui fait foi). La table est créée vide, donc le CHECK ne peut pas échouer ici.
  constraint server_report_recipients_email_format
    check (email ~ '^[^\s@;,?&#<>"]+@[^\s@;,?&#<>"]+\.[A-Za-z]{2,}$')
);

alter table public.server_report_recipients enable row level security;

-- Remplacement complet des policies (purge dynamique : on ne présume d'aucun nom
-- historique). Ne touche pas aux données.
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'server_report_recipients'
  loop
    execute format('drop policy if exists %I on public.server_report_recipients', r.policyname);
  end loop;
end $$;

-- LECTURE : tout compte ayant la page RepJour (rank >= 1). Enveloppe (select ...)
-- pour une évaluation unique par requête (InitPlan), comme les autres tables.
create policy "srr read (page:repjour)"
  on public.server_report_recipients for select
  to authenticated
  using ((select public.page_level_rank(public.get_page_level('repjour'))) >= 1);

-- ÉCRITURES : niveau « gestion » — exactement la garde de la modale (admin-only UI).
create policy "srr insert (page:repjour gestion)"
  on public.server_report_recipients for insert
  to authenticated
  with check ((select public.get_page_level('repjour')) = 'gestion');

create policy "srr update (page:repjour gestion)"
  on public.server_report_recipients for update
  to authenticated
  using ((select public.get_page_level('repjour')) = 'gestion')
  with check ((select public.get_page_level('repjour')) = 'gestion');

create policy "srr delete (page:repjour gestion)"
  on public.server_report_recipients for delete
  to authenticated
  using ((select public.get_page_level('repjour')) = 'gestion');

-- =============================================================================
-- Vérifications (lecture seule) après exécution :
--   1) La table et ses 4 policies existent :
--      select policyname, cmd from pg_policies
--      where schemaname='public' and tablename='server_report_recipients'
--      order by policyname;
--   2) Compte AVEC RepJour : select count(*) from public.server_report_recipients; -- OK
--   3) Compte SANS RepJour (JWT direct) : select * ... limit 5; -- attendu : 0 ligne
--   4) Envoi serveur par un admin : toujours OK (service_role côté fonction).
-- =============================================================================

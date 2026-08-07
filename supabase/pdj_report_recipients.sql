-- =============================================================================
-- pdj_report_recipients — destinataires DÉDIÉS à l'envoi du PDJ par e-mail
-- (Resend, via l'Edge Function send-report en mode kind='pdj'). Liste
-- INDÉPENDANTE de server_report_recipients (RepJour) et de email_recipients :
-- des listes distinctes évitent tout mélange entre les diffusions RepJour et PDJ
-- (exigence explicite : « sinon conflit avec les clients »).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- NON DESTRUCTIF : crée une table + ses policies. Ne touche à aucune donnée
-- existante et ne modifie aucune autre liste.
--
-- MODÈLE DE SÉCURITÉ (identique à server_report_recipients, mais gardé sur la
-- page PDJ) :
--   - LECTURE : tout compte ayant la page PDJ (n'importe quel niveau). La modale
--     de gestion est admin-only côté UI ; la lecture reste ouverte au niveau
--     « page PDJ » par cohérence (adresses de diffusion interne, non sensibles).
--   - ÉCRITURE (insert/update/delete) : niveau « gestion » de la page PDJ.
--   - L'Edge Function send-report lit CÔTÉ SERVEUR avec la clé service_role
--     (bypass RLS) et exige déjà profiles.role = 'admin' : ces policies ne
--     bloquent pas l'envoi.
--
-- PRÉREQUIS : page_permissions.sql exécuté (is_admin / page_level_rank /
-- get_page_level existent et sont grantées à authenticated).
-- =============================================================================

create table if not exists public.pdj_report_recipients (
  id         bigint generated always as identity primary key,
  email      text not null,
  name       text not null default '',
  type       text not null default 'to' check (type in ('to', 'cc')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  -- Même classe de caractères que les autres listes : exclut espaces et
  -- ? & # ; , < > " — hygiène d'adresse (la validation cliente double ce CHECK,
  -- qui fait foi). La table est créée vide, donc le CHECK ne peut pas échouer ici.
  constraint pdj_report_recipients_email_format
    check (email ~ '^[^\s@;,?&#<>"]+@[^\s@;,?&#<>"]+\.[A-Za-z]{2,}$')
);

alter table public.pdj_report_recipients enable row level security;

-- Remplacement complet des policies (purge dynamique : on ne présume d'aucun nom
-- historique). Ne touche pas aux données.
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'pdj_report_recipients'
  loop
    execute format('drop policy if exists %I on public.pdj_report_recipients', r.policyname);
  end loop;
end $$;

-- LECTURE : tout compte ayant la page PDJ (rank >= 1). Enveloppe (select ...)
-- pour une évaluation unique par requête (InitPlan), comme les autres tables.
create policy "prr read (page:pdj)"
  on public.pdj_report_recipients for select
  to authenticated
  using ((select public.page_level_rank(public.get_page_level('pdj'))) >= 1);

-- ÉCRITURES : niveau « gestion » de la page PDJ (garde de la modale, admin-only UI).
create policy "prr insert (page:pdj gestion)"
  on public.pdj_report_recipients for insert
  to authenticated
  with check ((select public.get_page_level('pdj')) = 'gestion');

create policy "prr update (page:pdj gestion)"
  on public.pdj_report_recipients for update
  to authenticated
  using ((select public.get_page_level('pdj')) = 'gestion')
  with check ((select public.get_page_level('pdj')) = 'gestion');

create policy "prr delete (page:pdj gestion)"
  on public.pdj_report_recipients for delete
  to authenticated
  using ((select public.get_page_level('pdj')) = 'gestion');

-- =============================================================================
-- Vérifications (lecture seule) après exécution :
--   1) La table et ses 4 policies existent :
--      select policyname, cmd from pg_policies
--      where schemaname='public' and tablename='pdj_report_recipients'
--      order by policyname;
--   2) Compte AVEC PDJ : select count(*) from public.pdj_report_recipients; -- OK
--   3) Compte SANS PDJ (JWT direct) : select * ... limit 5; -- attendu : 0 ligne
--   4) Envoi PDJ par un admin : toujours OK (service_role côté fonction).
-- =============================================================================

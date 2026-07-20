-- =============================================================================
-- email_recipients_rls_hardening — lecture réservée aux comptes ayant la page
-- RepJour, gestion (écritures) réservée au niveau « gestion » (admin inclus),
-- au lieu d'une lecture ouverte à TOUT compte authentifié.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- ⚠ DDL DE POLICIES : ne supprime AUCUNE donnée, mais remplace les policies de
--   public.email_recipients. Avant exécution, sauvegarder l'état actuel :
--     select policyname, cmd, qual, with_check
--     from pg_policies
--     where schemaname = 'public' and tablename = 'email_recipients'
--     order by policyname;
--
-- POURQUOI
--   - Pentest 2026-07-20 : un compte avec get_page_level('repjour') = NULL et
--     user_page_permissions = {affichage: lecture} lisait quand même
--     email_recipients via l'API anon + JWT.
--   - L'Edge Function send-report lit les destinataires CÔTÉ SERVEUR avec la
--     service_role (bypass RLS) et exige déjà profiles.role = 'admin' : resserrer
--     ces policies ne casse pas l'envoi serveur.
--
-- POURQUOI LA LECTURE N'EST **PAS** LIMITÉE À « gestion »
--   Une première version de ce script réservait aussi la LECTURE au niveau
--   « gestion », en partant du principe que seule la modale « Destinataires »
--   (admin) lisait la table. C'est faux : le bouton « Envoyer par email » de
--   DashboardBoard.tsx:677-700 n'a AUCUNE garde de rôle (commentaire assumé
--   lignes 646-650, « Visibles par TOUS les rôles ») et appelle sendReport →
--   openMailWithRecipients → fetchRecipients(). Avec la lecture en « gestion » :
--     - fetchRecipients() renvoie [] (recipients.ts:22-27 avale l'erreur, il ne
--       lit même pas `error` et retourne `data || []`) ;
--     - le mailto s'ouvre SANS destinataire, sans message d'erreur ;
--     - l'utilisateur croit avoir envoyé le rapport journalier à personne.
--   Régression silencieuse sur la feature quotidienne de l'app.
--
--   Et surtout : verrouiller la lecture n'apporterait aucune confidentialité,
--   puisque ce même bouton affiche la liste complète dans le client mail de
--   n'importe quel utilisateur RepJour. Le niveau juste est donc « avoir la
--   page RepJour » pour lire, « gestion » pour modifier.
--
-- PRÉREQUIS : page_permissions.sql exécuté (is_admin/page_level_rank/
-- get_page_level existent et sont grantées à authenticated). Vérifié en prod par
-- le pentest : rpc/get_page_level('affichage') a renvoyé "lecture".
-- =============================================================================

alter table public.email_recipients enable row level security;

-- Remplacement complet des policies de la table (évite qu'une ancienne policy
-- permissive oubliée reste OR-ed avec les nouvelles). Ne touche pas aux données.
-- La purge est dynamique parce qu'on ne connaît pas les noms des policies
-- historiques : deviner un nom laisserait silencieusement la table ouverte.
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'email_recipients'
  loop
    execute format('drop policy if exists %I on public.email_recipients', r.policyname);
  end loop;
end $$;

-- Lecture : tout compte ayant la page RepJour, quel que soit son niveau.
-- Ferme le trou du pentest (get_page_level('repjour') = NULL → rank 0 → refusé)
-- sans casser le bouton « Envoyer par email », ouvert à tous les niveaux.
-- L'appel est enveloppé dans un (select ...) pour être évalué une seule fois par
-- requête (InitPlan) plutôt qu'une fois par ligne — patron repris à l'Étape 4.
create policy "email_recipients read (page:repjour)"
  on public.email_recipients for select
  to authenticated
  using ((select public.page_level_rank(public.get_page_level('repjour'))) >= 1);

-- Écritures : niveau « gestion » uniquement — c'est exactement la garde de la
-- modale « Destinataires ». send-report (service_role) n'est pas affecté.
create policy "email_recipients insert (page:repjour gestion)"
  on public.email_recipients for insert
  to authenticated
  with check ((select public.get_page_level('repjour')) = 'gestion');

create policy "email_recipients update (page:repjour gestion)"
  on public.email_recipients for update
  to authenticated
  using ((select public.get_page_level('repjour')) = 'gestion')
  with check ((select public.get_page_level('repjour')) = 'gestion');

create policy "email_recipients delete (page:repjour gestion)"
  on public.email_recipients for delete
  to authenticated
  using ((select public.get_page_level('repjour')) = 'gestion');

-- =============================================================================
-- Vérifications à faire après exécution (lecture seule) :
--   1) Policies présentes :
--      select policyname, cmd, qual, with_check
--      from pg_policies
--      where schemaname = 'public' and tablename = 'email_recipients'
--      order by policyname;
--   2) Avec un compte ayant RepJour (n'importe quel niveau) :
--      select count(*) from public.email_recipients;  -- OK, liste complète
--   3) Avec un compte SANS RepJour (JWT dans Postman/console) :
--      select * from public.email_recipients limit 5; -- attendu : 0 ligne
--   4) Avec un compte RepJour « lecture » : le bouton « Envoyer par email » de
--      /repjour ouvre le client mail AVEC les destinataires. C'est le test de
--      non-régression le plus important.
--   5) Avec un compte RepJour « lecture » : la modale « Destinataires » n'est de
--      toute façon pas affichée (isAdmin), et un insert direct via l'API est
--      refusé.
--   6) Envoi du rapport par un admin : toujours OK (service_role côté fonction).
-- =============================================================================


-- =============================================================================
-- OPTIONNEL — contrainte de format sur `email`
--
-- ⚠ NE PAS exécuter dans le même batch que ce qui précède. Un CHECK posé sur une
--   table dont des lignes violent déjà la condition ÉCHOUE, et l'échec annulerait
--   la transaction entière, donc les policies ci-dessus avec.
--
-- Étape 1 — contrôler d'abord (doit renvoyer 0 ligne) :
--   select id, email, name, type, active
--   from public.email_recipients
--   where email !~ '^[^\s@;,?&#<>"]+@[^\s@;,?&#<>"]+\.[A-Za-z]{2,}$';
--
--   Si des lignes remontent : ce sont de VRAIES adresses de destinataires, les
--   lire et les corriger à la main. Ne pas les supprimer par réflexe.
--
-- Étape 2 — seulement si le contrôle renvoie 0 ligne, exécuter séparément :
--
--   alter table public.email_recipients
--     drop constraint if exists email_recipients_email_format;
--
--   alter table public.email_recipients
--     add constraint email_recipients_email_format
--     check (email ~ '^[^\s@;,?&#<>"]+@[^\s@;,?&#<>"]+\.[A-Za-z]{2,}$');
--
-- POURQUOI : la classe de caractères exclut ?, &, #, ;, ,, <, >, " et les
-- espaces — précisément ce qui permettrait à une adresse stockée de détourner
-- l'URL mailto construite dans email.ts:94 (où `toList` est interpolé BRUT).
-- C'est la seule garantie non contournable : la validation côté client reste
-- contournable via l'anon key et un appel PostgREST direct.
-- =============================================================================

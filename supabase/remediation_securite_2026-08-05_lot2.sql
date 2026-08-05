-- =============================================================================
-- REMÉDIATION SÉCURITÉ — pentest #2, LOT 2 (script consolidé)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, EN UNE FOIS.
-- Fait suite à remediation_securite_2026-08-05.sql (lot 1). SÛR / idempotent.
--
-- Couvre :
--   B2 — profiles : figer `email` dans la policy self-update (anti-usurpation
--        d'affichage ; /profil ne modifie jamais l'email, seulement prénom/nom).
--   A5 — rapro_rooms : colonne `materialized` (distingue une ligne « nettoyée »
--        POSÉE À LA CLÔTURE d'une correction manuelle → purge ciblée à la
--        réouverture, cf. code client). Non destructif : add column if not exists.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- B2 — profiles self-update : figer email (en plus de role)
-- -----------------------------------------------------------------------------
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
    and email = (select email from public.profiles where id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- A5 — rapro_rooms : flag `materialized`
-- -----------------------------------------------------------------------------
-- true = ligne 'nettoyee' créée automatiquement à la clôture (materializeCleaned).
-- Permet, à la réouverture, de purger ces lignes SANS toucher aux corrections
-- manuelles (materialized = false). Les lignes existantes prennent false (défaut)
-- → seules les clôtures FUTURES sont couvertes (les anciennes restent inchangées).
alter table public.rapro_rooms
  add column if not exists materialized boolean not null default false;

commit;

-- Vérification (lecture seule) :
--   select pg_get_expr(pol.polwithcheck, pol.polrelid) like '%email =%'
--     from pg_policy pol where pol.polname = 'Users update own profile';  -- B2 → true
--   select exists (select 1 from information_schema.columns
--     where table_name='rapro_rooms' and column_name='materialized');     -- A5 → true

-- =============================================================================
-- REPJOUR — bandeau « pas encore envoyé » : bouton « Ignorer » (masquage PARTAGÉ)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Idempotent, NON destructif.
--
-- Ajoute une colonne de masquage sur daily_reports + une RPC gardée par rôle pour la
-- poser. « Ignorer » retire le bandeau POUR TOUT LE MONDE (décision partagée « on
-- n'envoie pas ce rapport »), SANS toucher à auto_sent_at (l'envoi auto/manuel reste
-- possible). Accessible aux niveaux ecriture/gestion de la page repjour — les admins
-- ont 'gestion' via get_page_level(), donc ils sont couverts.
--
-- PRÉREQUIS : page_permissions.sql exécuté (is_admin / page_level_rank / get_page_level).
-- =============================================================================

-- 1. Colonne de masquage. DISTINCTE de auto_sent_at → n'interfère pas avec l'envoi.
alter table public.daily_reports
  add column if not exists send_reminder_dismissed_at timestamptz;

-- 2. RPC : pose le masquage pour une date donnée. SECURITY DEFINER (contourne la RLS
--    pour écrire cette seule colonne), garde de rôle explicite, search_path figé.
create or replace function public.dismiss_send_reminder(p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Garde : niveau >= ecriture (rang 2) sur la page repjour. get_page_level renvoie
  -- 'gestion' pour les admins → éditeur + gestionnaire + admin passent ; les comptes
  -- sans la page (niveau NULL → rang 0) sont refusés.
  if public.page_level_rank(public.get_page_level('repjour')) < 2 then
    raise exception 'Acces refuse : niveau ecriture requis sur la page repjour.'
      using errcode = '42501';
  end if;

  -- Idempotent : ne masque que le rapport encore NON envoyé et NON déjà masqué.
  update public.daily_reports
     set send_reminder_dismissed_at = now()
   where date = p_date
     and auto_sent_at is null
     and send_reminder_dismissed_at is null;
end;
$$;

-- 3. Exécution : authenticated uniquement, JAMAIS anon.
revoke all on function public.dismiss_send_reminder(date) from public;
revoke all on function public.dismiss_send_reminder(date) from anon;
grant execute on function public.dismiss_send_reminder(date) to authenticated;

-- =============================================================================
-- Vérification (lecture seule) après exécution :
--   1) La colonne existe :
--      select column_name from information_schema.columns
--      where table_schema='public' and table_name='daily_reports'
--        and column_name='send_reminder_dismissed_at';                       -- 1 ligne
--   2) Fonction security definer + search_path figé :
--      select proname, prosecdef, proconfig from pg_proc
--      where proname='dismiss_send_reminder';                                 -- prosecdef=t
--   3) anon NE peut PAS l'exécuter :
--      select has_function_privilege('anon',
--        'public.dismiss_send_reminder(date)','execute');                     -- f
-- =============================================================================

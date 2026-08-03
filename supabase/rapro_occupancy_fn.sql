-- =============================================================================
-- RAPRO — fonction d'occupation In-House SANS données nominatives
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- Remplace l'ancienne VUE rapro_occupancy (signalée par le linter Supabase
-- « security_definer_view », lint 0010) par une FONCTION SECURITY DEFINER — le
-- pattern sanctionné pour un accès à privilège contrôlé (le linter ne cible que
-- les vues). Ne touche aucune donnée.
--
-- POURQUOI (rappel)
--   Le rapprochement lit l'occupation In-House depuis `pdj_breakfasts` (page PDJ),
--   fermée en lecture à la page pdj car porteuse du nom client. Cette fonction
--   expose UNIQUEMENT (room, adr) pour un jour donné — jamais guest_name — et se
--   garde elle-même sur la page `rapro` (get_page_level lit le JWT de l'appelant,
--   même dans une fonction SECURITY DEFINER). Un compte rapro sans droit pdj voit
--   donc l'occupation, sans jamais recevoir de PII.
-- =============================================================================

-- 1) Retire l'ancienne vue (qui déclenchait le lint 0010).
drop view if exists public.rapro_occupancy;

-- 2) Fonction de remplacement. SECURITY DEFINER + search_path figé (évite le lint
--    function_search_path_mutable). Renvoie 0 ligne si l'appelant n'a pas au moins
--    la lecture sur rapro (même sémantique qu'une RLS fermée : aucune erreur).
create or replace function public.rapro_occupancy(p_date date)
returns table (room int, adr numeric)
language sql
security definer
stable
set search_path = public
as $$
  select b.room::int, b.adr
  from public.pdj_breakfasts b
  where b.service_date = p_date
    and (select public.page_level_rank(public.get_page_level('rapro'))) >= 1
$$;

-- 3) Accès : révoqué par défaut (public/anon), accordé aux seuls authentifiés.
revoke all on function public.rapro_occupancy(date) from public, anon;
grant execute on function public.rapro_occupancy(date) to authenticated;


-- VÉRIFICATION — la fonction existe et est bien SECURITY DEFINER (prosecdef = t).
select proname, prosecdef, pg_get_function_identity_arguments(oid) as args
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'rapro_occupancy';

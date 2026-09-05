-- =============================================================================
-- rpc_invoker_2026-09 — dismiss_send_reminder en SECURITY INVOKER, policy
-- self-update de profiles réparée, suppression de 3 fonctions sans appelant
--
-- Application : `supabase db query --linked -f supabase/rpc_invoker_2026-09.sql`
-- EN UNE FOIS (une transaction). Idempotent (`create or replace`, `drop … if
-- exists`, `drop policy if exists` + `create policy`).
--
-- (1) dismiss_send_reminder : sa garde interne (`page repjour >= ecriture`)
--     est STRICTEMENT identique à la policy UPDATE de daily_reports
--     (« daily_reports update (page:repjour) », rang >= 2). Elle n'a donc
--     aucun besoin de privilèges : SECURITY INVOKER, la RLS fait le travail,
--     la garde reste pour un message d'erreur lisible. Bonne pratique Supabase,
--     et un avertissement 0029 de moins, sans indirection.
--
-- (2) profiles « Users update own profile » : BUG PRÉEXISTANT (lot B2 du
--     2026-08-05). Son `with check` relisait `profiles` en sous-requête pour
--     figer `role` et `email` ; or une policy qui interroge sa propre table
--     déclenche « 42P17 infinite recursion detected in policy » : depuis le
--     5 août, AUCUN utilisateur non admin ne pouvait modifier son profil
--     (/profil échouait). Reproduit le 2026-09-05 en transaction annulée
--     (`update profiles set display_name = display_name where id = auth.uid()`
--     → 42P17). Correctif : lire role/email via des fonctions SECURITY DEFINER
--     du schéma privé (comme is_admin), ce qui est précisément la solution
--     documentée par Supabase pour les policies auto-référentes. La garantie
--     B2 (email figé) et l'anti-escalade (role figé, doublé par le trigger
--     protect_role_escalation) sont conservées à l'identique.
--
-- (3) set_parking_tarif, literie_record_movement, literie_toggle_bedding :
--     AUCUN appelant. Vérifié le 2026-09-05 : 0 occurrence dans src/ et
--     supabase/functions/ ; 0 dépendance pg_depend ; 0 policy ; aucune
--     fonction appelante ; pg_stat_statements (depuis mars) ne contient que
--     leur création et leurs grants, jamais un appel. La literie écrit
--     hotel_rooms directement ; le stock est abandonné (src/lib/literie/
--     types.ts). parking_tarifs se modifie par le SQL Editor. Suppression
--     confirmée par l'utilisateur le 2026-09-05. Rollback : parking_tarifs.sql
--     et literie.sql portent encore les définitions (en-tête « REMPLACÉ »).
-- =============================================================================

-- (1) dismiss_send_reminder → invoker
create or replace function public.dismiss_send_reminder(p_date date)
returns void
language plpgsql
security invoker
set search_path = public
as $function$
begin
  -- Garde : niveau >= ecriture (rang 2) sur la page repjour. Doublon lisible de
  -- la policy UPDATE de daily_reports (qui refuserait de toute façon, en
  -- silence : 0 ligne mise à jour).
  if private.page_level_rank(private.get_page_level('repjour')) < 2 then
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
$function$;
revoke execute on function public.dismiss_send_reminder(date) from public, anon;
grant execute on function public.dismiss_send_reminder(date) to authenticated;

-- (2) profiles self-update : aides privées pour lire SON rôle et SON email
--     sans relire la table sous RLS (récursion).
create or replace function private.get_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $function$
  select email from public.profiles where id = auth.uid();
$function$;
revoke execute on function private.get_user_email() from public, anon;
grant execute on function private.get_user_email() to authenticated;

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select private.get_user_role())
    and email = (select private.get_user_email())
  );

-- (3) Fonctions sans appelant (confirmation utilisateur du 2026-09-05)
drop function if exists public.set_parking_tarif(numeric, numeric, date);
drop function if exists public.literie_toggle_bedding(smallint, boolean);
drop function if exists public.literie_record_movement(smallint, text, text, smallint);

-- =============================================================================
-- VÉRIFICATION (lecture seule)
-- =============================================================================
select 'dismiss_send_reminder security definer' as controle, prosecdef::text as valeur
from pg_proc where pronamespace = 'public'::regnamespace and proname = 'dismiss_send_reminder'
union all
select 'policy self-update sans sous-requete sur profiles',
       (position('FROM profiles' in coalesce(with_check, '')) = 0)::text
from pg_policies where tablename = 'profiles' and policyname = 'Users update own profile'
union all
select 'fonctions supprimees restantes', count(*)::text
from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('set_parking_tarif','literie_toggle_bedding','literie_record_movement');

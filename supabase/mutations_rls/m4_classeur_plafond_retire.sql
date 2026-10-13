-- MUTATION M4 (base LOCALE, transaction annulée) : le plafond « niveau
-- effectif = min(page, classeur) » est retiré de `private.classeur_niveau_de`
-- (page lecture → droit du classeur tel quel). Attendu : 04_classeur_acces
-- ÉCHOUE (lecture écrit dans A grâce à son exception « ecriture »,
-- reception dans D).
-- Lancer : psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -q -At -f supabase/mutations_rls/m4_classeur_plafond_retire.sql
begin;
create or replace function private.classeur_niveau_de(p_classeur_id bigint, p_created_by uuid, p_acces_tous text)
 returns text
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_page   text := private.get_page_level('classeur');
  v_uid    uuid := auth.uid();
  v_droit  text;
begin
  if v_page is null then
    return 'aucun';
  end if;
  if v_page = 'gestion' then
    return 'gestion';
  end if;
  v_droit := coalesce(
    (select a.niveau from public.classeur_acces a
      where a.classeur_id = p_classeur_id and a.user_id = v_uid),
    case when p_created_by = v_uid then 'ecriture' end,
    p_acces_tous);
  if v_droit is null or v_droit = 'aucun' then
    return 'aucun';
  end if;
  return v_droit;   -- MUTANT : plus de plafond par le droit de page
end;
$function$;
\i supabase/tests/04_classeur_acces.test.sql

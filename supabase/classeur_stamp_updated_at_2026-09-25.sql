-- =============================================================================
-- classeur_stamp_updated_at_2026-09-25.sql — le trigger d'estampillage des
-- tables classeur_* respecte un `updated_at` FOURNI par le client.
--
-- Application : `supabase db query --linked -f supabase/classeur_stamp_updated_at_2026-09-25.sql`
-- Le corps de la fonction est aussi mis à jour dans l'autorité unique
-- `classeur_2026-09-25.sql` (section 3) : rejouer l'un ou l'autre donne le
-- même résultat.
--
-- Symptôme (audit adverse de la fusion JSON, défaut #1) : la fusion applique
--   la règle « dernier écrit gagne » sur `updated_at`. Or le trigger forçait
--   `updated_at = now()` à CHAQUE écriture : un fichier de 10 h fusionné à
--   midi estampillait l'élément « midi », et le fichier de 11 h (plus récent,
--   contenu différent) était ensuite jugé plus ancien → `unchanged`,
--   modification perdue en silence. Le Rust d'origine avait le même défaut.
--
-- Correctif : sur UPDATE, `updated_at` n'est forcé à `now()` que si le client
--   ne l'a pas changé (`new.updated_at is not distinct from old.updated_at`) ;
--   sur INSERT, le défaut `now()` s'applique sauf valeur fournie. L'interface
--   ne fournit jamais `updated_at` (donc `now()`, comme avant) ; la fusion
--   fournit l'horodatage du fichier, et la restauration celui de l'instantané.
--
-- Innocuité : `create or replace` d'une fonction trigger invoker, corps
--   strictement plus permissif sur une seule colonne d'horodatage. Aucune
--   donnée réécrite. Un client peut désormais poser un `updated_at` arbitraire
--   sur SES écritures : même niveau de confiance que le contenu lui-même.
--
-- Vérification : fin de script, lecture seule.
-- =============================================================================

begin;

create or replace function public.classeur_stamp()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.updated_at is null then
      new.updated_at := now();
    end if;
  else
    new.created_by := private.keep_author(new.created_by, old.created_by);
    -- Fourni et différent : conservé (fusion / restauration). Sinon : now().
    if new.updated_at is not distinct from old.updated_at then
      new.updated_at := now();
    end if;
  end if;
  return new;
end;
$function$;
revoke execute on function public.classeur_stamp() from public, anon, authenticated;

commit;

select 'classeur_stamp respecte un updated_at fourni' as controle,
       (pg_get_functiondef('public.classeur_stamp()'::regprocedure)
          like '%is not distinct from old.updated_at%')::text as ok
union all
select 'classeur_stamp non executable par anon/authenticated',
       (not has_function_privilege('anon', 'public.classeur_stamp()', 'execute')
        and not has_function_privilege('authenticated', 'public.classeur_stamp()', 'execute'))::text
union all
select 'trigger toujours pose 7 fois',
       ((select count(*) from pg_trigger where tgname = 'classeur_stamp' and not tgisinternal) = 7)::text;

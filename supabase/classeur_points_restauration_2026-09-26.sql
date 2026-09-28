-- =============================================================================
-- REMPLACÉ — NE PLUS REJOUER (audit de sécurité du 2026-09-28).
-- Rejoué, il laisserait tout compte `ecriture` supprimer les points
-- automatiques de n'importe quel classeur, même caché.
-- Autorité : classeur_2026-09-25.sql (sections 8 et 9). Contrôle :
-- verif_classeur_acces.sql (échoue si ce fichier a été rejoué).
-- =============================================================================
-- =============================================================================
-- classeur_points_restauration_2026-09-26.sql — l'historique des fusions
-- devient un système de POINTS DE RESTAURATION (mineurs / majeurs).
--
-- Application : `supabase db query --linked -f supabase/classeur_points_restauration_2026-09-26.sql`
-- L'autorité `classeur_2026-09-25.sql` est mise à jour en parallèle (colonnes,
-- trigger, policy) : rejouer l'un ou l'autre donne le même résultat.
--
-- Demande utilisateur (nuit du 25 au 26/09) : « de vraies sauvegardes pour
--   revenir en arrière, créées facilement, même pour une petite modification,
--   une dizaine conservées, mineures et majeures ». Jusqu'ici la table ne
--   recevait un instantané qu'avant une fusion JSON ou une restauration.
--
-- Correctif :
--   - `kind` : 'auto' (mineur : pris par l'application avant une session de
--     modifications, au plus un par quart d'heure), 'manuel' (majeur : créé
--     par l'utilisateur, avec un libellé), 'fusion' (avant un import JSON),
--     'securite' (avant une restauration). Défaut 'fusion' pour les lignes
--     existantes, qui étaient toutes des fusions.
--   - `label` : libellé libre d'un point manuel.
--   - `taille` : poids de l'instantané en octets, posé par trigger
--     (`pg_column_size`), pour l'afficher et surveiller ce que ça coûte.
--   - policy delete : l'élagage des points 'auto' doit pouvoir être fait par
--     qui les crée (rang >= 2), sinon l'historique d'un compte `ecriture`
--     grandirait sans borne ; les autres restent réservés à `gestion`.
--
-- Innocuité : add column if not exists avec défauts, trigger before insert
--   (pose `taille` seulement), UPDATE ciblé des lignes existantes pour
--   renseigner `taille` (sans `where` : la table est celle des instantanés,
--   la colonne était NULL partout, aucune autre donnée n'est touchée),
--   policy recréée. Rejouable.
--
-- Vérification : fin de script, lecture seule.
-- =============================================================================

begin;

alter table public.classeur_merge_history
  add column if not exists kind text not null default 'fusion'
    check (kind in ('auto', 'manuel', 'fusion', 'securite')),
  add column if not exists label text not null default '',
  add column if not exists taille integer;

comment on column public.classeur_merge_history.kind is
  'auto = point mineur pris avant une session de modifications ; manuel = point majeur nommé ; fusion = avant un import JSON ; securite = avant une restauration';
comment on column public.classeur_merge_history.taille is
  'pg_column_size(snapshot) en octets, posé par trigger à l''insertion';

create index if not exists classeur_merge_history_kind_idx
  on public.classeur_merge_history (classeur_id, kind, merged_at desc);

create or replace function public.classeur_merge_history_taille()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  new.taille := pg_column_size(new.snapshot);
  return new;
end;
$function$;
revoke execute on function public.classeur_merge_history_taille() from public, anon, authenticated;

drop trigger if exists classeur_merge_history_taille on public.classeur_merge_history;
create trigger classeur_merge_history_taille
  before insert on public.classeur_merge_history
  for each row execute function public.classeur_merge_history_taille();

-- Lignes antérieures à la colonne (taille encore NULL).
update public.classeur_merge_history
   set taille = pg_column_size(snapshot)
 where taille is null;

drop policy if exists "classeur_merge_history delete (page:classeur)" on public.classeur_merge_history;
create policy "classeur_merge_history delete (page:classeur)"
  on public.classeur_merge_history for delete to authenticated
  using (
    (select private.get_page_level('classeur')) = 'gestion'
    or (
      kind = 'auto'
      and (select private.page_level_rank(private.get_page_level('classeur'))) >= 2
    )
  );

commit;

select 'colonnes kind, label, taille presentes' as controle,
       ((select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'classeur_merge_history'
            and column_name in ('kind', 'label', 'taille')) = 3)::text as ok
union all
select 'trigger taille pose',
       ((select count(*) from pg_trigger where tgname = 'classeur_merge_history_taille' and not tgisinternal) = 1)::text
union all
select 'fonction taille non executable par anon/authenticated',
       (not has_function_privilege('anon', 'public.classeur_merge_history_taille()', 'execute')
        and not has_function_privilege('authenticated', 'public.classeur_merge_history_taille()', 'execute'))::text
union all
select 'aucune ligne sans taille',
       ((select count(*) from public.classeur_merge_history where taille is null) = 0)::text
union all
select 'policy delete : gestion, ou auto en ecriture',
       ((select count(*) from pg_policies where tablename = 'classeur_merge_history'
           and policyname = 'classeur_merge_history delete (page:classeur)'
           and qual like '%kind = ''auto''%') = 1)::text
union all
select 'aucune fonction security definer classeur_* dans public',
       ((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname like 'classeur\_%' and p.prosecdef) = 0)::text;

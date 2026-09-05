-- =============================================================================
-- AFFICHAGE — modèle d'accès PAR PROPRIÉTAIRE
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Idempotent.
-- Ajoute l'auteur (created_by), l'estampille serveur, et les policies :
--   - lecture  : voit tous les modèles (exposés à tous) + génère des PDF + édite
--     « à chaud » localement (aucune écriture DB, donc rien à borner ici) ;
--   - ecriture : crée des modèles ; modifie/supprime UNIQUEMENT les SIENS
--     (created_by = auth.uid()) ; jamais ceux des autres ;
--   - gestion  : crée / modifie / supprime TOUS les modèles.
-- L'auteur d'origine est PRÉSERVÉ à chaque modification (created_by figé serveur).
-- Les modèles historiques (seed, created_by NULL) ne sont modifiables qu'en gestion.
-- =============================================================================

-- 1) Colonne auteur (nullable : les modèles seedés restent sans auteur = gestion-only).
alter table public.affiche_templates
  add column if not exists created_by uuid;

create index if not exists affiche_templates_created_by_idx
  on public.affiche_templates (created_by);

-- 2) Estampille SERVEUR : created_by posé à l'INSERT (auth.uid()), FIGÉ à l'UPDATE
--    (préserve l'auteur d'origine, même quand la gestion édite le modèle d'un autre).
--    updated_at maintenu ici aussi (remplace l'ancien trigger updated_at seul).
create or replace function public.affiche_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();   -- ignore toute valeur envoyée par le client
    new.updated_at := now();
  else
    new.created_by := old.created_by; -- auteur d'origine immuable
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists affiche_templates_set_updated_at on public.affiche_templates;
drop trigger if exists affiche_templates_stamp on public.affiche_templates;
create trigger affiche_templates_stamp
  before insert or update on public.affiche_templates
  for each row execute function public.affiche_stamp();

-- 3) Policies. On droppe TOUS les noms connus (rôle + page) pour être autoritatif.
drop policy if exists "affiche read (authenticated)" on public.affiche_templates;
drop policy if exists "affiche read (page:affichage)" on public.affiche_templates;
drop policy if exists "affiche insert (super/admin)" on public.affiche_templates;
drop policy if exists "affiche update (super/admin)" on public.affiche_templates;
drop policy if exists "affiche delete (super/admin)" on public.affiche_templates;
drop policy if exists "affiche write (page:affichage)" on public.affiche_templates;
drop policy if exists "affiche update (page:affichage)" on public.affiche_templates;
drop policy if exists "affiche delete (page:affichage)" on public.affiche_templates;

-- LECTURE : tous les porteurs de la page (les modèles sont exposés à tous).
create policy "affiche read (page:affichage)"
  on public.affiche_templates for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('affichage'))) >= 1);

-- INSERT : écriture (created_by est posé par le trigger, pas par le client).
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "affiche write (page:affichage)"
  on public.affiche_templates for insert to authenticated
  with check ((select public.page_level_rank(public.get_page_level('affichage'))) >= 2);

-- UPDATE : gestion (tout) OU écriture sur SON propre modèle.
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "affiche update (page:affichage)"
  on public.affiche_templates for update to authenticated
  using (
    (select public.get_page_level('affichage')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('affichage'))) >= 2
      and created_by = auth.uid()
    )
  )
  with check (
    (select public.get_page_level('affichage')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('affichage'))) >= 2
      and created_by = auth.uid()
    )
  );

-- DELETE : gestion (tout) OU écriture sur SON propre modèle.
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "affiche delete (page:affichage)"
  on public.affiche_templates for delete to authenticated
  using (
    (select public.get_page_level('affichage')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('affichage'))) >= 2
      and created_by = auth.uid()
    )
  );


-- VÉRIFICATION — colonne présente + 4 policies + trigger.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'affiche_templates'
  and column_name = 'created_by';

select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'affiche_templates'
order by cmd;

select tgname from pg_trigger
where tgrelid = 'public.affiche_templates'::regclass
  and not tgisinternal;

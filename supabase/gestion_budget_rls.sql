-- =============================================================================
-- GESTION BUDGÉTAIRE — RLS `budget` rattachée à repjour:gestion
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Idempotent.
-- Ne touche QUE les policies de `budget` : aucune table, aucune donnée.
--
-- POURQUOI
--   La page /gestion (budget) passe du modèle par GRADE (grade admin) au modèle
--   PAR PAGE : le budget est de la donnée repjour, éditable au niveau `gestion`.
--   On remplace l'ancienne policy FOR ALL « Admin manages budget »
--   (get_user_role() = 'admin') par des policies d'écriture bornées à
--   get_page_level('repjour') = 'gestion'. L'admin ayant gestion partout, il
--   conserve l'accès total ; aucun compte admin ne perd rien.
--
--   La LECTURE reste « budget read (page:repjour) » (>= 1), déjà posée par
--   page_permissions_rls_lectures.sql — NON touchée ici.
-- =============================================================================

-- Retire l'ancienne policy FOR ALL par grade (portait la lecture ET l'écriture).
drop policy if exists "Admin manages budget" on public.budget;

-- Écriture bornée à repjour:gestion.
drop policy if exists "budget write (page:repjour gestion)" on public.budget;
drop policy if exists "budget update (page:repjour gestion)" on public.budget;
drop policy if exists "budget delete (page:repjour gestion)" on public.budget;

create policy "budget write (page:repjour gestion)"
  on public.budget for insert to authenticated
  with check (public.get_page_level('repjour') = 'gestion');
create policy "budget update (page:repjour gestion)"
  on public.budget for update to authenticated
  using (public.get_page_level('repjour') = 'gestion')
  with check (public.get_page_level('repjour') = 'gestion');
create policy "budget delete (page:repjour gestion)"
  on public.budget for delete to authenticated
  using (public.get_page_level('repjour') = 'gestion');


-- VÉRIFICATION — plus de « Admin manages budget » ; 1 read + 3 write.
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'budget'
order by cmd, policyname;

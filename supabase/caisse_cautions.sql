-- =============================================================================
-- caisse_cautions — cautions clients (dépôt de garantie en espèces)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- Table NOUVELLE, indépendante des tables partagées.
--
-- Une ligne = UNE caution prise à un client (chambre + montant + commentaire
-- libre), active dès `taken_date` et jusqu'à son remboursement EXCLU
-- (`refunded_date`) : le fond de caisse attendu d'un jour intègre son montant
-- tant que `taken_date <= jour` et (`status = 'active'` ou `jour < refunded_date`).
-- DÈS le jour du remboursement (borne exclusive), elle ne compte plus — voir
-- src/lib/caisse/cautions.ts, effectiveFundTarget. Décision explicite de
-- l'utilisateur (plan/caisse-cautions/00-INDEX.md, D3) : pas de logique de
-- « jour où elle compte encore », simple soustraction immédiate au moment du
-- clic « Rembourser ».
--
-- Le fond effectif est TOUJOURS recalculé en direct (jamais stocké/figé) — voir
-- 00-INDEX.md, décision D4 : ajouter une caution rétroactive corrige donc
-- automatiquement l'affichage d'une feuille déjà clôturée, sans jamais réécrire
-- cette feuille (aucun conflit avec son verrou RLS).
-- 2026-09-05 : aides en schéma private (voir private_schema_aides.sql)
-- =============================================================================

-- ---- Table + index ----------------------------------------------------------
create table if not exists public.caisse_cautions (
  id              uuid primary key default gen_random_uuid(),
  room            smallint not null,          -- pas de CHECK de plage : les
                                               -- numéros réels (102-114, 201-214,
                                               -- …, 621-631) ne sont pas 1-80,
                                               -- cf. src/lib/hotel/rooms.ts —
                                               -- même choix que pdj_breakfasts /
                                               -- rapro_rooms (aucun des deux ne
                                               -- contraint `room` en base)
  amount          numeric(10, 2) not null check (amount > 0),
  comment         text not null default '',
  taken_date      date not null,             -- jour à partir duquel elle compte
  status          text not null default 'active' check (status in ('active', 'refunded')),
  refunded_date   date,                      -- jour du remboursement (borne exclusive)
  refunded_by     uuid references auth.users(id),
  refunded_at     timestamptz,
  created_by      uuid not null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Cohérence : un statut 'refunded' a TOUJOURS sa date/auteur/horodatage, et
  -- réciproquement (les 3 colonnes de remboursement vont ensemble).
  check (
    (status = 'refunded' and refunded_date is not null and refunded_by is not null and refunded_at is not null)
    or
    (status = 'active' and refunded_date is null and refunded_by is null and refunded_at is null)
  ),
  check (refunded_date is null or refunded_date >= taken_date)
);

create index if not exists caisse_cautions_taken_date_idx
  on public.caisse_cautions (taken_date);
create index if not exists caisse_cautions_status_idx
  on public.caisse_cautions (status);

-- ---- Trigger d'estampillage SERVEUR ------------------------------------------
-- `updated_at` toujours serveur ; `created_by` figé à l'INSERT ; `refunded_by`/
-- `refunded_at` JAMAIS acceptés du client — posés serveur uniquement à la
-- transition 'active' -> 'refunded' (empêche un rôle `ecriture` de se faire
-- passer pour un autre auteur, ou de post-dater le remboursement). Un UPDATE
-- qui ne touche pas `status` (ex. correction du commentaire) laisse ces
-- colonnes intactes : NEW reflète déjà OLD pour toute colonne non touchée par
-- le SET du client, et aucune des deux branches ci-dessous ne s'exécute dans
-- ce cas (ni transition vers 'refunded', ni vers 'active').
create or replace function public.caisse_cautions_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.refunded_by := null;
    new.refunded_at := null;
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    if new.status = 'refunded' and old.status = 'active' then
      new.refunded_by := auth.uid();
      new.refunded_at := now();
    elsif new.status = 'active' and old.status = 'refunded' then
      -- Retour à 'active' (annulation d'un remboursement saisi par erreur) :
      -- on efface proprement la trace du remboursement précédent.
      new.refunded_by := null;
      new.refunded_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists caisse_cautions_stamp on public.caisse_cautions;
create trigger caisse_cautions_stamp
  before insert or update on public.caisse_cautions
  for each row execute function public.caisse_cautions_stamp();

-- ---- RLS — policies « par page » (page:caisse) -------------------------------
-- Mêmes fonctions que les autres tables (get_page_level, page_level_rank, déjà
-- déployées). Pas de fenêtre glissante (D7) : une caution est un événement
-- ponctuel, pas daté par un « jour de saisie » comme une feuille de caisse.
alter table public.caisse_cautions enable row level security;

drop policy if exists "caisse cautions read (page:caisse)" on public.caisse_cautions;
create policy "caisse cautions read (page:caisse)"
  on public.caisse_cautions for select to authenticated
  using ((select private.page_level_rank(private.get_page_level('caisse'))) >= 1);

drop policy if exists "caisse cautions write (page:caisse)" on public.caisse_cautions;
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "caisse cautions write (page:caisse)"
  on public.caisse_cautions for insert to authenticated
  with check ((select private.page_level_rank(private.get_page_level('caisse'))) >= 2);

drop policy if exists "caisse cautions update (page:caisse)" on public.caisse_cautions;
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "caisse cautions update (page:caisse)"
  on public.caisse_cautions for update to authenticated
  using ((select private.page_level_rank(private.get_page_level('caisse'))) >= 2)
  with check ((select private.page_level_rank(private.get_page_level('caisse'))) >= 2);

-- Suppression : voir supabase/caisse_cautions_delete_ecriture_same_day.sql
-- (autorité UNIQUE pour cette policy — ne PAS la recréer ici, ce serait un
-- revert silencieux vers l'ancienne règle « gestion seule »).

-- ---- Vérification (lecture seule) -------------------------------------------
-- select policyname, cmd from pg_policies where tablename = 'caisse_cautions';       -- 4 lignes
-- select relrowsecurity from pg_class where relname = 'caisse_cautions';             -- t

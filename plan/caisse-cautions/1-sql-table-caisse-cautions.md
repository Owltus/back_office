# Étape 1 — Table `caisse_cautions` + RLS + trigger d'estampillage

## Objectif

Créer la table qui porte les cautions clients (chambre, montant, commentaire, cycle de vie active → remboursée), avec des policies RLS calquées sur le pattern déjà éprouvé (`caisse_sheets`, `pdj_breakfasts`, `parking_reservations`).

## Contexte

Décisions actées (voir `00-INDEX.md`, Angles à clarifier) qui conditionnent ce schéma : D1 (caution physiquement dans le tiroir-caisse), D3 (elle compte encore le jour de son remboursement), D5 (rembourser ≠ supprimer), D6 (chambre = `smallint`), D7 (pas de fenêtre glissante à l'écriture), D8 (lecture rank≥1, écriture rank≥2, suppression gestion).

## Fichier(s) impacté(s)

- `supabase/caisse_cautions.sql` (nouveau)

## Travail à réaliser

### 1. Table + contraintes

```sql
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
-- lib/caisse/cautions.ts, effectiveFundTarget. Décision explicite de l'utilisateur
-- (00-INDEX.md, D3) : pas de logique de « jour où elle compte encore », simple
-- soustraction immédiate au moment du clic « Rembourser ».
--
-- Le fond effectif est TOUJOURS recalculé en direct (jamais stocké/figé) — voir
-- 00-INDEX.md, décision D4 : ajouter une caution rétroactive corrige donc
-- automatiquement l'affichage d'une feuille déjà clôturée, sans jamais réécrire
-- cette feuille (aucun conflit avec son verrou RLS).
-- =============================================================================

create table if not exists public.caisse_cautions (
  id              uuid primary key default gen_random_uuid(),
  room            smallint not null,          -- pas de CHECK de plage (D6) :
                                               -- les vrais numéros ne sont PAS
                                               -- 1-80 (cf. lib/hotel/rooms.ts)
  amount          numeric(10, 2) not null check (amount > 0),
  comment         text not null default '',
  taken_date      date not null,             -- jour à partir duquel elle compte
  status          text not null default 'active' check (status in ('active', 'refunded')),
  refunded_date   date,                      -- dernier jour où elle compte encore (inclus)
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
```

### 2. Trigger d'estampillage serveur

Miroir de `caisse_stamp()` (`supabase/caisse_sheets.sql`) : `updated_at` toujours serveur ; `created_by` figé à l'INSERT ; **`refunded_by`/`refunded_at` jamais acceptés du client** — posés serveur uniquement quand `status` passe de `'active'` à `'refunded'` (empêche un rôle `ecriture` de se faire passer pour un autre auteur, ou de post-dater le remboursement).

```sql
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
    elsif new.status = 'active' then
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
```

### 3. RLS — policies `page:caisse`

Mêmes fonctions que les autres tables (`get_page_level`, `page_level_rank`, déjà déployées). Pas de fenêtre glissante (D7) : une caution est un événement ponctuel, pas daté par un « jour de saisie » comme une feuille.

```sql
alter table public.caisse_cautions enable row level security;

drop policy if exists "caisse cautions read (page:caisse)" on public.caisse_cautions;
create policy "caisse cautions read (page:caisse)"
  on public.caisse_cautions for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('caisse'))) >= 1);

drop policy if exists "caisse cautions write (page:caisse)" on public.caisse_cautions;
create policy "caisse cautions write (page:caisse)"
  on public.caisse_cautions for insert to authenticated
  with check (public.page_level_rank(public.get_page_level('caisse')) >= 2);

drop policy if exists "caisse cautions update (page:caisse)" on public.caisse_cautions;
create policy "caisse cautions update (page:caisse)"
  on public.caisse_cautions for update to authenticated
  using (public.page_level_rank(public.get_page_level('caisse')) >= 2)
  with check (public.page_level_rank(public.get_page_level('caisse')) >= 2);

drop policy if exists "caisse cautions delete (page:caisse gestion)" on public.caisse_cautions;
create policy "caisse cautions delete (page:caisse gestion)"
  on public.caisse_cautions for delete to authenticated
  using (public.get_page_level('caisse') = 'gestion');
```

## Ordre d'exécution

1. Table + contraintes (bloc 1)
2. Fonction + trigger (bloc 2)
3. RLS (bloc 3)
4. Vérification (ci-dessous)

## Critère de validation

- `select policyname, cmd from pg_policies where tablename = 'caisse_cautions';` → 4 lignes (select/insert/update/delete)
- `select relrowsecurity from pg_class where relname = 'caisse_cautions';` → `t`
- Insertion manuelle de test (rôle `ecriture`) puis passage en `refunded` → `refunded_by`/`refunded_at` posés automatiquement, non modifiables par un `update` qui tenterait de les forcer à une autre valeur.
- Un rôle `lecture` seule ne peut ni insérer ni mettre à jour (RLS refuse).

## Contrôle qualité (revue)

Étape critique (nouvelle table + RLS + trigger). À la place de `/borg` (non installé sur ce projet), revue manuelle ciblée avant/après exécution :
- Les contraintes CHECK (statut ↔ colonnes de remboursement) empêchent-elles un état incohérent même via un `update` partiel ?
- Le trigger gère-t-il bien le cas `UPDATE` qui ne touche PAS `status` (ex. correction du `comment` sur une caution déjà active) sans effacer `refunded_by`/`refunded_at` par erreur — **point à vérifier en priorité**, la logique actuelle du bloc 2 ne réinitialise que sur transition explicite vers `'active'` ou `'refunded'`, donc un `UPDATE` qui laisse `status` inchangé ne devrait toucher à rien côté remboursement ; à confirmer par un test manuel.
- Nommage du trigger (`caisse_cautions_stamp`) : pas de collision avec `caisse_stamp`, `pdj_*_stamp`, etc. (déjà vérifié par grep, aucun autre trigger de ce nom dans `supabase/`).

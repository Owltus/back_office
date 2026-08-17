# Étape 2 — Stock et mouvements de literie synthétique

## Objectif

Créer le compteur de stock de secours (oreillers + couettes synthétiques) et
l'historique de ses mouvements (mise en place / retour, par chambre). À
l'issue, chaque action « installer »/« retirer » côté grille (étape 7) peut
s'appuyer sur une source de vérité en base, avec traçabilité.

## Contexte

Aucun précédent de gestion de stock dans le projet (premier chantier du
genre). Décision D3 (voir index) : le compteur ne peut pas devenir négatif en
base (`check >= 0`), mais rien n'empêche l'écriture d'un mouvement de
« mise en place » quand le stock affiché est à 0 — c'est à l'UI (étape 7)
d'avertir sans bloquer.

## Fichier(s) impacté(s)

- `supabase/literie_stock.sql` (nouveau) — compteur + mouvements + RLS

## Travail à réaliser

### 1. Compteur (ligne unique, comme `hotel_config`)

```sql
create table if not exists public.literie_stock (
  id                  smallint primary key default 1 check (id = 1),
  synthetic_pillows   integer not null default 0 check (synthetic_pillows >= 0),
  synthetic_duvets    integer not null default 0 check (synthetic_duvets >= 0),
  updated_at          timestamptz not null default now()
);

insert into public.literie_stock (id) values (1) on conflict (id) do nothing;
```

### 2. Historique des mouvements

```sql
create table if not exists public.literie_stock_movements (
  id          uuid primary key default gen_random_uuid(),
  room        smallint not null references public.hotel_rooms(room),
  item        text not null check (item in ('oreiller', 'couette')),
  direction   text not null check (direction in ('mise_en_place', 'retour')),
  quantity    smallint not null default 1 check (quantity > 0),
  created_at  timestamptz not null default now(),
  created_by  uuid not null default auth.uid()
);

create index if not exists literie_stock_movements_room_idx
  on public.literie_stock_movements (room, created_at desc);
```

### 3. RPC d'écriture atomique (mouvement + décrément/incrément du compteur)

Pour éviter une désynchronisation entre l'insertion du mouvement et la mise à
jour du compteur (deux écritures séparées depuis le client), passer par une
RPC `SECURITY DEFINER` unique :

```sql
create or replace function public.literie_record_movement(
  p_room smallint, p_item text, p_direction text, p_quantity smallint default 1
) returns void language plpgsql set search_path = public as $$
begin
  if public.page_level_rank(public.get_page_level('literie')) < 2 then
    raise exception 'not authorized';
  end if;

  insert into public.literie_stock_movements (room, item, direction, quantity)
  values (p_room, p_item, p_direction, p_quantity);

  update public.literie_stock set
    synthetic_pillows = synthetic_pillows
      + case when p_item = 'oreiller' and p_direction = 'retour' then p_quantity
             when p_item = 'oreiller' and p_direction = 'mise_en_place' then -p_quantity
             else 0 end,
    synthetic_duvets = synthetic_duvets
      + case when p_item = 'couette' and p_direction = 'retour' then p_quantity
             when p_item = 'couette' and p_direction = 'mise_en_place' then -p_quantity
             else 0 end,
    updated_at = now()
  where id = 1;
end;
$$;
```

### 4. RLS

`enable row level security` sur les deux tables. Lecture par page (étape 5).
Écriture : **RPC uniquement** (`literie_record_movement`), pas de policy
INSERT/UPDATE directe — même pattern que `facturation_ref_imputations` (RPC
only pour les écritures sensibles).

## Ordre d'exécution

1. L'utilisateur exécute `literie_stock.sql` (dépend de `hotel_rooms.sql`,
   étape 1, pour la FK `room`).
2. Ajuster manuellement `synthetic_pillows`/`synthetic_duvets` au stock réel
   constaté (une seule fois, à la mise en service) via une requête `update`
   ponctuelle — pas de mouvement rétroactif à créer pour ce chiffrage initial.

## Critère de validation

- `select * from public.literie_stock` renvoie une ligne unique (`id = 1`).
- Un appel à `literie_record_movement` avec un rôle sans niveau écriture sur
  `literie` échoue (`not authorized`).
- Un appel valide incrémente/décrémente le bon compteur ET insère la ligne
  d'historique dans la même transaction (test : forcer une erreur après
  l'insert pour vérifier le rollback complet).
- Le compteur ne peut jamais passer sous 0 (`update ... set
  synthetic_pillows = -1` échoue sur la contrainte `check`).

## Contrôle /borg

Étape critique (CREATE TABLE ×2 + RPC SECURITY DEFINER en PRODUCTION). Audit
post-exécution :
- Garde de rôle en tête de la RPC (`page_level_rank(get_page_level('literie'))
  < 2`) + `set search_path = public`.
- Aucune policy INSERT/UPDATE directe sur `literie_stock`/
  `literie_stock_movements` (RPC only).
- La RPC est bien atomique (mouvement + compteur dans la même transaction
  implicite de fonction plpgsql — pas d'update partiel possible).
- `created_by` sur les mouvements n'est jamais falsifiable depuis le client.

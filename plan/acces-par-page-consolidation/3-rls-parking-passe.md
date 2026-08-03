# Étape 3 — Parking : RLS temporelle sur `parking_reservations`

## Objectif

Répliquer en base la fenêtre de 7 jours : la garde client de l'étape 2 n'est
qu'ergonomique, seule la RLS Supabase empêche réellement un porteur de JWT de
modifier le passé figé. Aligner le vrai rempart sur la décision produit.

## Contexte

Les écritures sur `parking_reservations` sont aujourd'hui bornées par
`page_level_rank(get_page_level('parking')) >= 2` (écriture), sans dimension
temporelle (`supabase/page_permissions_rls.sql`). On ajoute la fenêtre : au-delà
de 7 jours après la fin de séjour, seule la `gestion` peut écrire. Modèle déjà
éprouvé sur la caisse (policy UPDATE conditionnée par `validated_at` + grâce).

## Fichier(s) impacté(s)

- `supabase/page_permissions_rls.sql` (modifié — policies UPDATE/DELETE/INSERT parking)

## Travail à réaliser

### 1. Remplacer les policies d'écriture parking (drop + create idempotents)

```sql
-- parking_reservations : écriture bornée par niveau ET fenêtre temporelle.
-- gestion => tout ; ecriture => uniquement les résa d'actualité (fin de séjour
-- >= aujourd'hui - 7 j). PARKING_GRACE_DAYS = 7 (miroir de lib/permissions/actions.ts).

drop policy if exists "parking_reservations write (page:parking)" on public.parking_reservations;
drop policy if exists "parking write (page:parking)" on public.parking_reservations;

-- UPDATE
create policy "parking_reservations update (page:parking)"
  on public.parking_reservations for update to authenticated
  using (
    public.get_page_level('parking') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('parking')) >= 2
      and (start_date + nights) >= (current_date - 7)
    )
  )
  with check (
    public.get_page_level('parking') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('parking')) >= 2
      and (start_date + nights) >= (current_date - 7)
    )
  );

-- DELETE
create policy "parking_reservations delete (page:parking)"
  on public.parking_reservations for delete to authenticated
  using (
    public.get_page_level('parking') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('parking')) >= 2
      and (start_date + nights) >= (current_date - 7)
    )
  );

-- INSERT
create policy "parking_reservations insert (page:parking)"
  on public.parking_reservations for insert to authenticated
  with check (
    public.get_page_level('parking') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('parking')) >= 2
      and (start_date + nights) >= (current_date - 7)
    )
  );
```

Adapter les noms de policy réels : d'abord lister l'existant sur
`parking_reservations` (`select policyname, cmd from pg_policies where tablename =
'parking_reservations'`) avant de rédiger les `drop`.

`start_date` est de type `date`, `nights` `int` → `start_date + nights` est une
`date` (checkout exclusif). Comparaison à `current_date - 7`. Cohérent avec le
client, qui compare la même borne.

### 2. Vérifier la lecture inchangée

La policy SELECT (`page_permissions_rls_lectures.sql`, seuil `>= 1`) reste telle
quelle : la lecture n'est jamais bornée dans le temps.

## Ordre d'exécution

1. Lister les policies existantes de `parking_reservations`.
2. Rédiger le bloc `drop/create` ajusté aux vrais noms.
3. L'**utilisateur** exécute le script dans Supabase → SQL Editor.
4. Test manuel : un compte `parking:ecriture` reçoit une erreur RLS en tentant de
   modifier une résa terminée depuis > 7 j ; un compte `parking:gestion` réussit.

## Contrôle /borg

Étape critique (RLS de production). Auditer :
- Les trois commandes (INSERT/UPDATE/DELETE) portent bien la même condition ; pas
  de policy résiduelle plus permissive laissée en place (sinon OR permissif).
- `with check` présent sur UPDATE et INSERT (sinon on peut déplacer une résa
  *vers* le passé figé sans blocage).
- La SELECT n'a pas été touchée. `anon` n'a aucun accès en écriture.
- Aucune donnée modifiée par le script (que des policies).

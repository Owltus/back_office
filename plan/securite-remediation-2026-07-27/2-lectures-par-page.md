# Étape 2 — Fermeture des lectures par page (H1 + H2)

## Objectif

Qu'un compte connecté sans permission sur une page lise **0 ligne** des tables de cette
page, y compris en s'adressant directement à PostgREST hors de l'app. Couvre les ~17
tables métier (H1, PII incluse) et la table oubliée `facturation_ref_imputations` (H2).

## Contexte

Les fichiers de table exposent `for select ... using (true)` (ou
`auth.uid() IS NOT NULL`). Le script `page_permissions_rls_lectures.sql` existe déjà et
ferme 16 tables par `page_level_rank(get_page_level('<page>')) >= 1`, mais (a) il n'a
probablement jamais été exécuté en prod, et (b) il **oublie**
`facturation_ref_imputations` (vérifié : ajoutée après le script). Effet de bord unique
et connu : `/rapro` lit `daily_reports` (ligne de contrôle OCC) — d'où la clause
`repjour OU rapro` sur cette table, déjà présente dans le script.

## Fichier(s) impacté(s)

- `supabase/page_permissions_rls_lectures.sql` (ajout du bloc `facturation_ref_imputations`)
- `supabase/facturation_ref_imputations.sql` (source : remplacer le `using(true)` ligne 35)

## Travail à réaliser

### 1. Ajouter `facturation_ref_imputations` au script de lectures

À la suite du dernier bloc (`facturation_wordpool`, vers la ligne 164) :

```sql
drop policy if exists "ref_imputations read (authenticated)" on public.facturation_ref_imputations;
drop policy if exists "facturation_ref_imputations read (authenticated)" on public.facturation_ref_imputations;
create policy "ref_imputations read (page:facturation)"
  on public.facturation_ref_imputations for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('facturation'))) >= 1);
```

> Utiliser le **nom exact** de la policy SELECT actuelle relevé à l'Étape 1 dans le
> `drop policy` (ci-dessus, les deux noms plausibles sont couverts).

### 2. Corriger la source pour éviter la réouverture (M1)

Dans `supabase/facturation_ref_imputations.sql:35`, remplacer :

```sql
  for select to authenticated using (true);
```

par la même policy par page que ci-dessus, pour qu'une re-exécution du fichier de table
ne rouvre pas la lecture.

### 3. Exécuter (utilisateur, SQL Editor)

Jouer `page_permissions_rls_lectures.sql` en entier, APRÈS avoir confirmé à l'Étape 1
les noms de policies à droper. Le script est idempotent.

## Ordre d'exécution

1. Éditer le script (bloc facturation_ref_imputations) + la source de table.
2. Utilisateur : exécuter le script complet dans le SQL Editor.
3. Lancer les vérifications ci-dessous.

## Critère de validation

```sql
-- Plus aucune lecture permissive (attendu : seul hotel_config, volontaire)
select tablename, policyname, qual from pg_policies
where schemaname='public' and cmd='SELECT'
  and (qual='true' or qual ilike '%auth.uid() IS NOT NULL%')
order by tablename;
```
- Tests fonctionnels : un compte SANS `caisse` obtient 0 ligne sur `caisse_sheets` via
  l'API ; un compte AVEC `rapro` mais SANS `repjour` ouvre `/rapro` et voit toujours la
  ligne de contrôle OCC ; un admin lit tout ; l'import RepJour fonctionne encore.

## Contrôle /borg

`drop policy` + `create policy` sur ~17 tables : auditer qu'AUCUNE policy d'ÉCRITURE
(INSERT/UPDATE/DELETE) n'a été emportée (comparer le compte par table à la sauvegarde de
l'Étape 1), que les 2 policies `FOR ALL` subsistent, et que `facturation_ref_imputations`
est bien couverte (le trou H2 est fermé). Vérifier aussi la perf (fonction évaluée une
fois, pas par ligne) sur `daily_reports`.

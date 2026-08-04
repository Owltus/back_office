# Étape 4 — M1 + M3 + F4 : assainir les fichiers de table SQL (revert silencieux)

## Objectif

Rendre les fichiers de création de table SÛRS à rejouer. Aujourd'hui, six fichiers
de table métier (plus les fichiers facturation) portent ENCORE les anciennes
policies permissives (`read ... using(true)`, `write ... get_user_role() in (...)`),
alors que l'état durci vit dans `page_permissions_rls*.sql` + `*_fenetre_*.sql`.
Rejouer un seul fichier de table écrase la policy durcie -> revert silencieux
(déjà survenu au moins une fois). On y neutralise aussi le `drop table cascade`
(M3) et on fige le `search_path` des triggers (F4).

## Contexte

C'est la faiblesse structurelle centrale : la régression n'est pas un bug de code
mais un piège de déploiement. Tant que les fichiers de table portent des policies,
n'importe quel rejeu « innocent » rouvre les lectures (PII comprise) et court-circuite
les permissions par page et les fenêtres temporelles.

## Fichier(s) impacté(s)

- `supabase/parking_realtime.sql`
- `supabase/pdj_breakfasts.sql`
- `supabase/pms_daily_metrics.sql`
- `supabase/rapro_rooms.sql`
- `supabase/rapro_sheets.sql`
- `supabase/caisse_sheets.sql`
- (facturation en lecture : `facturation_{budget_lines,issuer_codes,issuers,issuer_denylist,learned_docs,wordpool}.sql` + `facturation_admin_only.sql`)
- `supabase/security_hardening_triggers.sql` (search_path des fonctions stamp)

## Travail à réaliser

### 1. Retirer les blocs de policy des fichiers de table (M1)

Dans chacun des 6 fichiers de table métier, SUPPRIMER les `create policy` de
lecture `using (true)` et d'écriture `get_user_role() in (...)`. Ne laisser que
`create table if not exists`, index, `enable row level security`, et les triggers.
Ajouter un en-tête d'avertissement pointant vers l'autorité réelle :

```sql
-- RLS : les policies de CETTE table vivent dans page_permissions_rls*.sql et
-- <feature>_rls_fenetre_*.sql (autorité UNIQUE). Ne PAS recréer de policy ici :
-- un rejeu rouvrirait les lectures et court-circuiterait permissions + fenêtres.
```

Lignes concernées (repères de l'audit) : parking_realtime 47-73, pdj_breakfasts
75-97, pms_daily_metrics 68-92, rapro_rooms 64-86, rapro_sheets 67-90,
caisse_sheets 136-179. Idem lectures facturation (budget_lines 29-31,
issuer_codes 34, issuers 31, issuer_denylist 28, learned_docs 38, wordpool 62-63)
et le concaténé `facturation_admin_only.sql`.

Note : ne PAS retirer les policies de `page_permissions_rls*.sql` ni des fichiers
fenêtre — ce sont elles qu'on garde. `easter_eggs.sql` (lecture `using(true)`
volontaire, runtime) est laissé tel quel (documenté).

### 2. Neutraliser le `drop table ... cascade` (M3)

`rapro_rooms.sql:17` commence par `drop table if exists public.rapro_rooms cascade;`
(script de premier déploiement). Le retirer du fichier et le déplacer dans un
fichier séparé explicite, OU le commenter avec un jeton de confirmation :

```sql
-- ⚠ PREMIER DÉPLOIEMENT UNIQUEMENT — efface toute donnée. Décommenter sciemment.
-- drop table if exists public.rapro_rooms cascade;
```

### 3. Figer `search_path` des triggers d'estampillage (F4)

Ajouter `set search_path = public` directement dans la DÉFINITION de chaque
fonction trigger (pas seulement via `alter` dans `lint_hardening_functions.sql`,
qui est effacé par un `create or replace` rejoué). Fonctions : `caisse_stamp`,
`rapro_sheets_stamp`, `rapro_rooms_stamp`, `pms_daily_metrics_stamp`,
`parking_set_updated_at`, `pdj_set_updated_at`, `easter_eggs_set_updated_at`.
Exemple :

```sql
create or replace function public.parking_set_updated_at()
returns trigger language plpgsql
set search_path = public          -- ← ajouté
as $$
begin new.updated_at = now(); return new; end;
$$;
```

La source de vérité des fonctions stamp étant `security_hardening_triggers.sql`,
appliquer le `set search_path` là ET dans les fichiers de table qui les redéfinissent.

## Ordre d'exécution

1. Éditer les fichiers `.sql` (retrait policies + en-têtes + search_path + drop cascade).
2. NE RIEN rejouer en prod pour le retrait de policies (l'état durci est déjà en
   base) : le but est d'assainir le DÉPÔT. Seul le `set search_path` des triggers
   nécessite un rejeu (idempotent) si l'on veut le figer en base.
3. Committer.

## Critère de validation

- `grep -rn "using (true)" supabase/*.sql` ne renvoie plus que les cas volontaires
  documentés (easter_eggs).
- Rejouer mentalement n'importe quel fichier de table : il ne crée plus aucune policy.
- `rapro_rooms.sql` ne peut plus effacer la table par simple rejeu.
- Après rejeu des définitions stamp, le database linter 0011 reste à 0 sur ces fonctions.

## Contrôle /borg

Auditer : (1) aucune policy nécessaire n'a été retirée par erreur (les tables
gardent bien leurs policies durcies via page_permissions_rls*.sql — vérifier qu'on
n'a pas supprimé un fichier fenêtre) ; (2) les triggers stamp restent attachés et
fonctionnels après ajout du search_path (estampillage serveur toujours effectif) ;
(3) `facturation_admin_only.sql` (concaténé) ne réintroduit pas les lectures
`using(true)` s'il est rejoué.

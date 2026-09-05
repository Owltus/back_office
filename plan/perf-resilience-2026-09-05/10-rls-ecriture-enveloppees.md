# Étape 10 — SQL : policies d'écriture enveloppées en `(select …)`, sécurité identique

## Objectif

Réécrire, à sécurité STRICTEMENT identique, les policies INSERT / UPDATE /
DELETE / ALL qui appellent `get_page_level`, `is_admin` ou `get_user_role`
directement (évaluées par ligne) pour envelopper ces appels en
`(select …)` (évalués une fois par instruction), comme le sont déjà toutes
les policies SELECT. Décision de l'utilisateur du 2026-09-05.

## Contexte

Extraction du catalogue de prod (`pg_policies`, 2026-09-05) : 58 policies
d'écriture appellent une fonction de droits, dont 6 déjà enveloppées
(`email_recipients`, `server_report_recipients`). Restent 52 policies sur
19 tables : affiche_templates, baby_cot_assignments, baby_cots, budget,
caisse_cautions, caisse_sheets, daily_reports, easter_eggs, forecast_days,
hotel_config, hotel_rooms, literie_sheets, parking_reservations,
pdj_addon_production, pdj_breakfasts, pdj_externals, pms_daily_metrics,
profiles, rapro_rooms, rapro_sheets.

Le fichier est GÉNÉRÉ depuis le catalogue (source de vérité), pas recopié
des fichiers d'autorité : on ne peut donc pas réintroduire un état
antérieur. `repjour_manual_forecast_allowed(year, month)` dépend de la
ligne et n'est PAS enveloppée. `get_user_role()` doit être STABLE (étape 7)
pour que l'enveloppe ait un effet : dépendance.

## Fichier(s) impacté(s)

- `supabase/perf_rls_ecriture_2026-09-05.sql` (nouveau, généré)
- Miroirs d'autorité (modifiés, à l'identique de la prod après
  application) : `supabase/parking_rls_fenetre_7j.sql`,
  `rapro_rls_fenetre_2j.sql`, `caisse_rls_fenetre_1j.sql`,
  `pdj_rls_fenetre_3j.sql`, `page_permissions_rls_repjour.sql`,
  `gestion_budget_rls.sql`, `page_permissions_rls.sql`, `caisse_cautions.sql`,
  et les fichiers portant les policies affiche / literie / easter_eggs /
  profiles / hotel_config (localiser par grep du nom de policy).

## Travail à réaliser

### 1. Génération

Script jetable (scratchpad, node) : lit `pg_policies` (qual, with_check,
cmd, roles, policyname, tablename) et applique, sur chaque expression, ces
substitutions purement syntaxiques :

```
get_page_level('x'::text) = 'gestion'::text        → (select public.get_page_level('x')) = 'gestion'
page_level_rank(get_page_level('x'::text)) >= N    → (select public.page_level_rank(public.get_page_level('x'))) >= N
is_admin()                                         → (select public.is_admin())
get_user_role() = 'admin'::text                    → (select public.get_user_role()) = 'admin'
```

Tout le reste (conditions sur les colonnes, `CURRENT_DATE - n`, `auth.uid()`,
`repjour_manual_forecast_allowed(...)`) est recopié tel quel. Sortie, par
policy : `drop policy if exists "<nom>" on public.<table>;` puis
`create policy "<nom>" on public.<table> for <cmd> to <roles> using (...)
with check (...)` (clauses présentes selon `cmd`). Le fichier porte
l'en-tête du dépôt (application, idempotence, innocuité : « ne change ni
nom, ni commande, ni rôle, ni condition de colonne ; seules les
enveloppes `(select …)` sont ajoutées »).

### 2. Auto-contrôle avant application

Dans le même fichier, bloc VÉRIFICATION : nombre de policies d'écriture par
table AVANT (figé dans le fichier) et APRÈS (`select count(*) …`), et un
`select` listant toute policy d'écriture dont `qual || with_check` contient
encore `get_page_level(` ou `is_admin()` NON précédé de `select ` (attendu :
0 ligne, hors `repjour_manual_forecast_allowed`).

### 3. Application et contrôles de sécurité

```bash
git add supabase/perf_rls_ecriture_2026-09-05.sql && git commit …
supabase db query --linked -f supabase/perf_rls_ecriture_2026-09-05.sql
supabase db query --linked -f supabase/verif_complet.sql          # 19/19
supabase db query --linked -f supabase/verif_securite_2026-08-05.sql
```

Puis la preuve fonctionnelle sans écriture réelle : dans une transaction
annulée, `set local role authenticated` + `request.jwt.claims` d'un compte
NON admin sans droit d'écriture parking → `insert into
parking_reservations …` doit échouer (RLS) ; avec un compte ayant
`parking:ecriture` → doit passer pour `start_date >= current_date - 7` et
échouer avant ; `rollback`.

### 4. Miroirs d'autorité

Pour chaque fichier d'autorité, remplacer le texte de chaque policy
réécrite par la version enveloppée (même nom), avec une ligne de
commentaire datée. Contrôle : `pg_get_expr` de la prod = texte du fichier
(comparaison visuelle par policy, ou requête de diff).

## Ordre d'exécution

1. Étape 7 appliquée (get_user_role stable).
2. Génération, relecture complète du fichier généré (52 policies).
3. Commit, application annoncée à l'utilisateur, contrôles.
4. Miroirs, commit.

## Critère de validation

- `verif_complet.sql` 19/19 OK, `verif_securite_2026-08-05.sql` OK.
- Requête de contrôle : 0 policy d'écriture avec appel nu (hors
  `repjour_manual_forecast_allowed`).
- Même nombre de policies par table avant/après ; mêmes noms ; mêmes rôles.
- Preuve RLS en transaction annulée (point 3) : refus et acceptation
  identiques à avant.
- Écriture réelle depuis l'app par l'utilisateur (une réservation parking,
  une coche PDJ) : fonctionne.

## Contrôle qualité (revue)

Étape critique (52 policies de production). `/borg` n'étant pas installé,
revue manuelle ciblée : (1) diff textuel entre expression d'origine et
expression réécrite = uniquement des `(select public.` ajoutés et des
`::text` retirés ; (2) aucune policy supprimée sans être recréée dans la
même transaction (le fichier est joué EN UNE FOIS) ; (3) `roles` conservés
(`authenticated` ou `public` selon l'origine) ; (4) aucun fichier de table
rejoué.

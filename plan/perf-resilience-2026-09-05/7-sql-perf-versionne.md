# Étape 7 — SQL : `get_user_role` stable, vue `pdj_service_dates`, contrôle

## Objectif

Livrer un fichier SQL dédié, idempotent, non destructif, qui (a) déclare
`get_user_role()` STABLE, (b) crée une vue légère `pdj_service_dates`
remplaçant le scan de 12 787 lignes, (c) garde en section commentée l'index
`parking_reservations(start_date)` si un jour la table grossit ; plus un
script de contrôle `verif_perf.sql` en lecture seule.

## Contexte

- `get_user_role()` : `supabase/security_core.sql:99-105`, `language sql
  security definer set search_path = public`, corps `select role from
  profiles where id = auth.uid()`. Déclarée VOLATILE par défaut (vérifié en
  prod : `provolatile = 'v'`), utilisée par les policies `Admin reads all
  profiles` / `Admin manages profiles`. STABLE est correct (lecture seule)
  et permet au planificateur de ne l'évaluer qu'une fois.
- `fetchServiceDates` lit `pdj_daily_agg?select=service_date` : EXPLAIN =
  248 ms, Seq Scan 12 787 lignes + HashAggregate 784 groupes. Une vue
  `select distinct service_date from pdj_breakfasts` s'appuie sur l'index
  `pdj_breakfasts_service_date_idx` (Index Only Scan + Unique) : attendu
  moins de 10 ms.
- Autorité unique des RLS : ne JAMAIS rejouer `pdj_breakfasts.sql`,
  `parking_realtime.sql` (contient un `delete`), `page_permissions_rls_
  lectures.sql` (rouvrirait `daily_reports`), ni le fichier `_ROLLBACK`.
  Le fichier de cette étape ne touche AUCUNE policy.
- Discipline (skill `bob-assistant-supabase`) : fichier écrit et COMMITÉ
  avant `supabase db query --linked -f`, puis vérification.

## Fichier(s) impacté(s)

- `supabase/perf_2026-09-05.sql` (nouveau)
- `supabase/verif_perf.sql` (nouveau)
- `supabase/security_core.sql` (modifié : miroir `stable`)

## Travail à réaliser

### 1. `supabase/perf_2026-09-05.sql`

En-tête aux conventions du dépôt (titre encadré, application, idempotence,
innocuité, POURQUOI daté, VÉRIFICATION en fin). Corps :

```sql
-- (1) get_user_role : lecture seule, donc STABLE. Aucun changement de
--     sécurité (security definer + search_path figé conservés).
alter function public.get_user_role() stable;

-- (2) Dates de service distinctes, sans agrégat : Index Only Scan sur
--     pdj_breakfasts_service_date_idx. security_invoker : la RLS de
--     pdj_breakfasts (page:pdj lecture) s'applique telle quelle.
create or replace view public.pdj_service_dates
  with (security_invoker = true) as
  select distinct service_date
  from public.pdj_breakfasts;

grant select on public.pdj_service_dates to authenticated;
revoke all on public.pdj_service_dates from anon;

-- (3) OPTIONNEL, désactivé : index simple sur start_date. Mesuré inutile au
--     2026-09-05 (528 lignes, 6 ms). À activer si la table dépasse ~20 000
--     lignes.
-- create index if not exists parking_reservations_start_date_idx
--   on public.parking_reservations (start_date);

-- VÉRIFICATION (lecture seule)
select proname, provolatile from pg_proc
 where pronamespace = 'public'::regnamespace and proname = 'get_user_role';
select relname from pg_class where relname = 'pdj_service_dates';
```

`alter function … stable` n'invalide aucun plan en cache de façon
dangereuse et ne change pas les droits : innocuité à écrire noir sur blanc
dans l'en-tête.

### 2. `supabase/verif_perf.sql`

Sur le modèle de `verif_complet.sql` (`with checks(ordre, controle, ok) as
(values …)`, ligne RESULTAT GLOBAL OK/KO) :

1. `get_user_role` est `stable` (`provolatile = 's'`).
2. `pdj_service_dates` existe, `security_invoker` vrai
   (`pg_class.reloptions`), `anon` sans privilège.
3. Toutes les policies SELECT des tables de page contiennent `(select`
   (garde-fou contre un futur revert).
4. Aucune policy `using (true)` sur les tables de page (garde-fou M1).
5. Compte des index attendus présents (liste figée de l'état du
   2026-09-05).

Plus, hors du bloc OK/KO, un `explain (analyze, summary) select
service_date from public.pdj_service_dates order by service_date desc` à
lire à la main (attendu : Index Only Scan, moins de 10 ms).

### 3. Miroir `security_core.sql:99-105`

Ajouter `stable` à la définition versionnée, avec une ligne de commentaire
datée (2026-09-05, ce plan). Le fichier reste rejouable.

### 4. Application en prod (assistant, après revue)

```bash
git add supabase/perf_2026-09-05.sql supabase/verif_perf.sql supabase/security_core.sql
git commit -m "perf(sql): get_user_role stable + vue pdj_service_dates + verif_perf"
supabase db query --linked -f supabase/perf_2026-09-05.sql
supabase db query --linked -f supabase/verif_perf.sql
supabase db query --linked -f supabase/verif_complet.sql
```

`alter function` est un changement de définition : il est annoncé à
l'utilisateur au moment de l'application, dans le message de synthèse de
l'étape, conformément à la règle « destructif ou structurel = dit
explicitement ». Il est réversible par `alter function … volatile`.

## Ordre d'exécution

1. Écrire les trois fichiers, relire les en-têtes.
2. Commit.
3. Appliquer, vérifier (`verif_perf.sql` OK, `verif_complet.sql` 19/19 OK).
4. EXPLAIN de la vue sous rôle `authenticated` (technique du skill :
   fichier avec `set role authenticated` + `set_config('request.jwt.claims',
   …)`), noter le temps dans le message de fin d'étape.

## Critère de validation

- `verif_perf.sql` : RESULTAT GLOBAL OK.
- `verif_complet.sql` : 19/19 OK, inchangé.
- EXPLAIN ANALYZE de `pdj_service_dates` sous `authenticated` : moins de
  10 ms, plan sans Seq Scan de la table.
- Connexion et lecture d'une page par un compte non admin toujours
  fonctionnelles (les policies `profiles` utilisent `get_user_role`).

## Contrôle qualité (revue)

Étape critique (fonction appelée par des policies, nouvelle vue, base de
prod). `/borg` n'étant pas installé, revue manuelle ciblée : (1) aucun
`drop`, aucun `delete`, aucune policy dans le fichier ; (2) `security_
invoker = true` présent, `anon` révoqué ; (3) `security_core.sql` rejouable
et identique à la prod après application (`pg_get_functiondef`) ; (4) le
fichier est commité AVANT l'application.

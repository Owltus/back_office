# Plan — Résilience client et allègement des lectures (panne du 2026-09-05)

## Contexte

Le 2026-09-05 de 10h23 à 11h48, la base Supabase du Back Office (projet
`ozpavwghrmmkrnmkxodg`, compute Micro : `shared_buffers` 224 Mo, 60
connexions) a cessé de répondre : 504/522/503 sur tout ce qui touche
Postgres, Edge Functions et gateway intacts. Côté application, le squelette
de chargement est resté affiché sans message, puis, une fois le
rafraîchissement de jeton échoué, l'utilisateur a été renvoyé sur `/login`.
Le redémarrage du projet a tout rétabli. Ce n'était pas une attaque : un seul
navigateur, trois comptes connus, toujours les mêmes endpoints.

Ce que la reconnaissance a établi (4 agents Explore sur `plan/`, auth,
données front, SQL ; mesures directes en base via `supabase db query`,
`pg_stat_statements` depuis le 2026-03-24 et `EXPLAIN ANALYZE` sous le rôle
`authenticated`) :

- **La tempête de réessais est réelle et vient de l'application.**
  `src/components/auth/AuthContext.tsx:281-296` relit `profiles` et
  `user_page_permissions` toutes les 120 s, à chaque retour d'onglet ET à
  chaque événement d'auth (dont `TOKEN_REFRESHED`), sans déduplication, sans
  backoff, sans timeout. Depuis mars : 178 591 lectures `profiles`,
  141 594 lectures `user_page_permissions`. Sur `/parking`, `hardResync`
  (`ParkingBoard.tsx:484-543`) recharge la fenêtre complète sur
  `visibilitychange`, `focus` ET `online`, avec `staleTime: 0` et une clé de
  cache qui glisse chaque jour civil.
- **Aucun appel n'a de timeout** : `src/lib/supabase.ts` ne configure aucun
  `global.fetch`. Sous 522, une promesse pend jusqu'à ~100 s.
- **La panne n'est jamais montrée.** `AppAuthGate.tsx` n'a ni délai de garde
  ni état d'erreur. Pire, `PageGuard.tsx:83-91` transforme une erreur réseau
  en « Aucune page accessible » pour un utilisateur sans cache local.
  `refreshProfile` / `refreshPermissions` (`AuthContext.tsx:344-369`)
  effacent le cache local sur simple erreur.
- **Une seule requête applicative est réellement lourde** :
  `fetchServiceDates` (`src/lib/pdj/service.ts:63-80`) lit
  `pdj_daily_agg?select=service_date` : 248 ms, Seq Scan de 12 787 lignes +
  HashAggregate, 930 appels. Tout le reste est sain : fenêtre parking 6 ms
  (528 lignes), agrégat PDJ mensuel 12 ms, `parking_daily_occupation` 31 ms,
  journée PDJ 2 ms. **L'index « manquant » sur `parking_reservations.start_date`
  n'explique rien** (mesuré).
- **Les index et policies SELECT sont corrects** partout (toutes enveloppées
  en `(select …)`, index présents en prod = index versionnés). Seule
  `get_user_role()` est déclarée VOLATILE (`supabase/security_core.sql:99-105`)
  alors qu'elle ne fait qu'un SELECT.
- **La cause première du déclenchement à 10h23 n'est pas prouvée** (aucune
  trace en base après redémarrage). Le facteur dominant est le volume
  d'appels et l'absence de tout amortisseur côté client, sur un compute Micro.

Le chantier rend le client résilient (timeout, backoff exponentiel avec
jitter, déduplication, disjoncteur), montre honnêtement une panne au lieu
d'un squelette muet ou d'un faux « aucun accès », divise le volume de
lectures, et remplace la seule requête lourde. Méthodes éprouvées, aucune
régression fonctionnelle visible en fonctionnement normal.

## Remise en question (à défaut de /rodin)

- **Est-ce le bon chantier ?** Un passage du compute Micro à Small
  (dashboard, quelques euros) augmenterait la marge, mais ne supprimerait ni
  la tempête de réessais ni le squelette muet : au prochain incident, même
  scénario. Le chantier est nécessaire quelle que soit la taille du compute.
- **Alternative moins coûteuse ?** Se limiter aux étapes 1 à 3 (socle +
  auth + bandeau) règle déjà l'essentiel du risque de rechute. Les étapes 4 à
  8 sont de l'hygiène de charge, chacune indépendante et abandonnable.
- **Angle mort** : les 4 canaux Realtime (`postgres_changes`) ne sont pas
  audités ; leur reconnexion est gérée par `realtime-js`. Le chantier ne les
  touche pas, sauf le debounce d'invalidation de `DashboardBoard`.

## Décisions actées (validées le 2026-09-05)

- **Panne visible** : la personne reste sur sa page avec un bandeau
  « Connexion au serveur interrompue, nouvelle tentative dans X s » ; la
  session persistée est conservée quand seul le backend est tombé ; tout
  repart seul au retour du serveur. Plus de renvoi sur `/login`.
- **Cadence de revalidation des droits** : 3 min onglet visible, une fois au
  retour d'onglet, 60 s minimum entre deux, une seule en vol. Un changement
  de droits (ou une suppression de compte) se propage en 3 min au lieu de 2.
- **Planning parking** : rechargement au plus une fois par 30 s au retour
  d'onglet, temps réel inchangé, événements Realtime miroités dans le cache.
- **Index `parking_reservations(start_date)`** : NON créé (6 ms sur 528
  lignes) ; section commentée prête si la table dépasse ~20 000 lignes.
- **Policies d'ÉCRITURE** : réécrites MAINTENANT, à sécurité identique, en
  enveloppant les appels de fonctions en `(select …)` : étape 10, générée
  depuis le catalogue de prod, contrôles de sécurité rejoués.
- **Compute** : Micro conservé ; décision revue après les mesures de
  l'étape 9.
- **Exécution** : de bout en bout, un commit par étape, pas de push ; arrêt
  seulement sur contrôle en échec ou avant application SQL en prod
  (annoncée).

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-socle-resilience-client.md](./1-socle-resilience-client.md) | Socle : timeout fetch, disjoncteur, backoff, single-flight | — | P0 | 2h | `lib/backendHealth.ts` testé + `supabase.ts` avec timeout + `query.ts` retry/backoff | |
| 2 | [2-auth-cache-dedup-panne.md](./2-auth-cache-dedup-panne.md) | AuthContext et PageGuard : dedup, cache indestructible, panne différente de révocation | 1 | P0 | 2h30 | Plus de tempête profil/droits ; panne jamais affichée comme « aucun accès » ; éjection préservée | ⚠ |
| 3 | [3-bandeau-statut-backend.md](./3-bandeau-statut-backend.md) | Bandeau « service indisponible » et squelette non muet | 1, 2 | P0 | 1h30 | `shared/BackendStatusBanner.tsx`, garde de 5 s sur le squelette | |
| 4 | [4-parking-cle-stable-resync.md](./4-parking-cle-stable-resync.md) | Parking : colonnes explicites, clé stable, resync coalescé | 1 | P1 | 1h30 | 1 refetch par retour d'onglet, clé stable au mois, 7 colonnes | |
| 5 | [5-repjour-bande-allegee.md](./5-repjour-bande-allegee.md) | RepJour : bande de synthèse allégée, debounce Realtime | 1 | P1 | 2h | 15 → 9 requêtes au boot, `select` minimal, 1 invalidation par rafale | ⚠ |
| 6 | [6-cles-transverses.md](./6-cles-transverses.md) | Clés transverses : « première date » figée, dates PDJ unifiées | 1 | P1 | 1h | `staleTime: Infinity` sur les bornes, une seule clé `['pdj','dates']` | ⚠ |
| 7 | [7-sql-perf-versionne.md](./7-sql-perf-versionne.md) | SQL : `get_user_role` stable, vue `pdj_service_dates`, contrôle | — | P0 | 1h30 | `supabase/perf_2026-09-05.sql` appliqué + `supabase/verif_perf.sql` OK | ⚠ |
| 8 | [8-front-dates-pdj-legeres.md](./8-front-dates-pdj-legeres.md) | Front : `fetchServiceDates` sur la vue légère | 6, 7 | P1 | 30 min | 248 ms → moins de 10 ms par appel | |
| 10 | [10-rls-ecriture-enveloppees.md](./10-rls-ecriture-enveloppees.md) | SQL : policies d'écriture enveloppées en `(select …)`, sécurité identique | 7 | P1 | 2h | `supabase/perf_rls_ecriture_2026-09-05.sql` appliqué, miroirs d'autorité à jour, `verif_securite*` OK | ⚠ |
| 9 | [9-validation-globale.md](./9-validation-globale.md) | Validation globale avec panne simulée | 1-8, 10 | P0 | 1h30 | Preuves navigateur + base, commit | ⚠ |

## Ordre d'exécution

1. Étape 1 (socle) en premier : tout le reste s'y branche.
2. Étape 7 (SQL) est indépendante du code et se prépare en parallèle de
   l'étape 1 ; son application en prod passe par `supabase db query --linked
   -f` APRÈS commit du fichier et revue.
3. Étapes 2 puis 3, dans cet ordre (le bandeau lit l'état exposé par 2).
4. Étapes 4, 5, 6 sont indépendantes entre elles et de 2-3 : parallélisables
   dès que 1 est terminée.
5. Étape 8 après 6 (clé unifiée) et 7 (vue en prod).
6. Étape 10 après 7 (même discipline SQL : fichier commité, application
   annoncée, contrôles de sécurité rejoués).
7. Étape 9 en dernier, avec les scénarios de panne simulée et d'éjection.

## Architecture cible

```
src/lib/
  supabase.ts              [modifié]  global.fetch avec timeout + observation
  backendHealth.ts         [nouveau]  disjoncteur pur : état, backoff, single-flight
  backendHealth.test.ts    [nouveau]
  query.ts                 [modifié]  retry par nature d'erreur, retryDelay jitter
src/components/auth/
  AuthContext.tsx          [modifié]  dedup, gate disjoncteur, backendDown exposé
  PageGuard.tsx            [modifié]  panne ≠ aucun accès
  AppAuthGate.tsx          [modifié]  garde 5 s + bandeau
src/components/shared/
  BackendStatusBanner.tsx  [nouveau]  role=status, compte à rebours, Réessayer
supabase/
  perf_2026-09-05.sql      [nouveau]  get_user_role stable, vue pdj_service_dates
  verif_perf.sql           [nouveau]  contrôle lecture seule
  security_core.sql        [modifié]  miroir : stable
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Socle client | `src/lib/supabase.ts`, `src/lib/query.ts` | `src/lib/backendHealth.ts`, `src/lib/backendHealth.test.ts` |
| Auth | `src/components/auth/AuthContext.tsx`, `PageGuard.tsx`, `AppAuthGate.tsx`, `src/routes/login.tsx` | — |
| UI transverse | — | `src/components/shared/BackendStatusBanner.tsx` |
| Parking | `src/lib/parking/service.ts`, `src/components/parking/ParkingBoard.tsx` | — |
| RepJour | `src/components/repjour/DayCrossSummary.tsx`, `src/components/repjour/boards/DashboardBoard.tsx`, `src/lib/repjour/services/data.ts`, `src/lib/rapro/service.ts` | — |
| Clés transverses | `RaproBoard.tsx`, `RaproMonthlyBoard.tsx`, `RaproAnalytiqueBoard.tsx`, `BreakfastBoard.tsx`, `PdjAnalytiqueBoard.tsx`, `CaisseBoard.tsx`, `EasterEggs.tsx` | — |
| SQL Supabase | `supabase/security_core.sql`, `src/lib/pdj/service.ts` | `supabase/perf_2026-09-05.sql`, `supabase/verif_perf.sql` |
| SQL RLS écriture (miroirs d'autorité) | `supabase/parking_rls_fenetre_7j.sql`, `rapro_rls_fenetre_2j.sql`, `caisse_rls_fenetre_1j.sql`, `pdj_rls_fenetre_3j.sql`, `page_permissions_rls_repjour.sql`, `gestion_budget_rls.sql`, `page_permissions_rls.sql`, `caisse_cautions.sql` (selon catalogue) | `supabase/perf_rls_ecriture_2026-09-05.sql` |
| Documentation | `CLAUDE.md` (section performance) | — |
| **Total** | **27 modifiés** | **6 nouveaux** |

## Différé (hors chantier, à garder en tête)

- `UPDATE pdj_breakfasts set guest_name, purged_at` : 1 892 appels à 149 ms
  (max 3,7 s). Cause non identifiée (trigger `pdj_breakfasts_clamp_included`,
  Realtime, policy d'écriture nue). À mesurer avant d'agir.
- Rechargements du cache de schéma PostgREST (`pg_timezone_names`, 606 ms,
  ~16 par jour) : déclenchés par chaque DDL joué. Regrouper les scripts SQL
  limite mécaniquement ce coût.
- Fetch manuels hors TanStack Query sur `/gestion`
  (`BudgetContent.tsx:65-94`, `DataContent.tsx:244-262`).
- Politique de reconnexion des 4 canaux Realtime.

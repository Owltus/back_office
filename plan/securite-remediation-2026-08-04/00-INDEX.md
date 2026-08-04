# Plan — Remédiation sécurité (pentest du 2026-08-04)

## Contexte

Un test de pénétration red team a été mené le 2026-08-04 (5 agents parallèles,
analyse statique non destructive ; rapport `doc/pentest-2026-08-04.md`). Verdict :
backend globalement très bien durci (RLS partout, RPC gardées serveur, estampillage
infalsifiable, aucun secret committé). Un vrai chemin d'attaque subsiste néanmoins,
par chaînage d'un XSS stocké et des tokens en localStorage, plus un lot de
faiblesses SQL structurelles déjà connues mais jamais corrigées.

Ce plan corrige chaque finding, **dans l'ordre de priorité**, groupé en livrables
testables. Deux contraintes structurent tout : (1) le SQL est **exécuté par
l'utilisateur** dans Supabase -> SQL Editor — l'assistant produit les scripts, ne
joue rien contre la prod ; (2) plusieurs failles ne sont **vérifiables que dans la
base live** (E1, F3, et l'ordre d'application réel des policies), d'où l'Étape 2 de
diagnostic en prérequis strict des étapes DB.

## Angles à clarifier

- **TROISIÈME plan sécurité — le vrai risque est organisationnel, pas technique.**
  Ce plan supersède `plan/securite-pentest-externe/` (2026-07-20) ET
  `plan/securite-remediation-2026-07-27/`, **tous deux jamais exécutés**. Le pentest
  du 2026-08-04 a surtout **re-prouvé** que le plan du 27/07 n'a pas été appliqué :
  lectures `using(true)` toujours dupliquées dans les fichiers de table (M1),
  anti-escalade `profiles` toujours sans volet INSERT (E1), `get_user_role` toujours
  non versionnée (F3), CHECK email toujours en commentaire (F2). **Le livrable qui
  compte n'est pas le SQL (déjà écrit à 80 % ici et dans le plan du 27/07) mais
  l'EXÉCUTION effective + un re-test daté (Étape 10).** Décision à prendre : adopter
  ce plan consolidé comme unique référence et **archiver les deux précédents**, ou
  reprendre le 27/07. Il ne faut pas trois plans vivants en parallèle.
- **Nouveauté réelle vs 27/07 : C1 (XSS GalaxyChart).** L'audit du 27/07 concluait
  « aucun XSS stocké exploitable » — le pentest du 04/08 en a trouvé un, CRITIQUE
  (branche arête du tooltip non échappée, alimentée par un nom d'émetteur issu d'un
  PDF tiers). C'est le seul finding qui justifie à lui seul un nouveau plan, et il
  est en Étape 1 car il est critique, indépendant et corrigé en une ligne.
- **E1 : sévérité à confirmer (Élevée vs Moyenne).** Les deux agents du pentest
  divergeaient (RLS = Élevée, logique métier = Moyenne). Trancher exige de lire la
  policy INSERT LIVE de `profiles` (absente du dépôt) — c'est l'objet de l'Étape 2.
  Si la policy INSERT live borne déjà `role`, E1 est déjà couvert et l'Étape 3 se
  limite au versionnement + volet trigger INSERT défensif.
- **Vérifier AVANT de corriger (Étape 2 gate).** On ne réécrit pas une fonction ni
  ne `drop policy` sur un nom deviné. L'Étape 2 peut révéler que certains points
  sont déjà clos en prod (lectures fermées, get_user_role déjà à search_path figé).
  C'est le mode d'échec n°1 d'un durcissement, déjà signalé par les deux plans
  précédents.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-xss-galaxychart.md](./1-xss-galaxychart.md) | C1/E2 — échapper la branche arête du tooltip + compléter `escapeHtml` | — | P0 | 30min | Plus aucun XSS stocké via un nom d'émetteur PDF | |
| 2 | [2-diagnostic-base-live.md](./2-diagnostic-base-live.md) | Dump `pg_policies` + `pg_get_functiondef` (lecture seule) : profiles, get_user_role, ordre des policies, lignes email non conformes | — | P0 | 1h | `etat-base-2026-08-04.md` : on sait quoi corriger vraiment | |
| 3 | [3-profiles-insert-getuserrole.md](./3-profiles-insert-getuserrole.md) | E1 + F3 — policy INSERT `profiles` bornée + trigger volet INSERT + versionner `get_user_role` | 2 | P0 | 2h | Auto-promotion `admin` impossible à l'INSERT ; garde versionnée | ⚠ |
| 4 | [4-assainir-fichiers-table.md](./4-assainir-fichiers-table.md) | M1 + M3 + F4 — retirer les policies dupliquées des fichiers de table, neutraliser `drop cascade`, figer `search_path` des triggers | 2 | P0 | 2h30 | Rejouer un fichier de table ne peut plus rouvrir les lectures ni régresser le lint | ⚠ |
| 5 | [5-refermer-daily-reports.md](./5-refermer-daily-reports.md) | M2 — fonction d'occupation minimale + SELECT `daily_reports` ramené à `page:repjour` | 2 | P1 | 1h30 | Un compte rapro-only ne lit plus tout le reporting financier | ⚠ |
| 6 | [6-contrainte-format-email.md](./6-contrainte-format-email.md) | F2 — CHECK format `email_recipients` (après contrôle 0 ligne non conforme) | 2 | P1 | 30min | Une adresse ne peut plus détourner le `mailto:` | ⚠ |
| 7 | [7-garde-dernier-admin.md](./7-garde-dernier-admin.md) | I6 — `set_user_grade` refuse de rétrograder le dernier admin | 2 | P2 | 30min | Plus de verrouillage total possible de l'administration | ⚠ |
| 8 | [8-durcissement-edge-functions.md](./8-durcissement-edge-functions.md) | F5 + F6 — rate limit `send-report`, rollback `create-user` borné, messages d'erreur génériques | — | P2 | 2h | Un token admin volé ne peut plus servir de relais e-mail ni supprimer un compte orphelin arbitraire | |
| 9 | [9-durcissement-client.md](./9-durcissement-client.md) | I3 + I5 + I4 — `detectSessionInUrl:false`, garde params `$year/$month`, bump deps | — | P2 | 1h30 | Surface client réduite, params de route bornés | |
| 10 | [10-validation-globale.md](./10-validation-globale.md) | Re-test complet sur compte jetable + clôture finding par finding | 1-9 | P0 | 1h30 | `retest-2026-08-XX.md` : chaque finding clos ou accepté | ⚠ |

## Ordre d'exécution

- **Étape 1 en premier, seule et immédiate** : C1 est le seul finding CRITIQUE, il
  est indépendant (front) et se corrige en une ligne. Aucune raison d'attendre.
- **Étape 2 ensuite, seule** : lecture pure, ne change rien, mais 3/4/5/6/7 en
  dépendent. Écrire un `drop policy` / réécrire une fonction sur un état deviné =
  croire avoir durci ce qui reste ouvert.
- **Sprint DB (séquentiel, SQL exécuté par l'utilisateur)** : 3 -> 4 -> 5 -> 6 -> 7.
  Chaque script est idempotent et sauvegarde l'état avant remplacement.
- **Sprint front/ops (parallélisable avec le DB)** : 8 (Edge Functions, déployées
  par l'utilisateur) et 9 (client, `git push`).
- **Étape 10 en dernier**, tout déployé. Matrice de re-test sur un **compte
  jetable**, jamais sur des données de prod.

## Architecture cible

```
src/
├── components/facturation/GalaxyChart.tsx   ← escapeHtml complété + branche arête  [modifié]
├── lib/supabase.ts                          ← detectSessionInUrl:false             [modifié]
├── lib/shared/routeParams.ts                ← parseYearMonthParams (garde bornée)  [nouveau]
└── routes/{repjour,rapro,pdj,parking,caisse}/analytique.$year.$month.tsx           [modifiés]

supabase/
├── profiles.sql                             ← +policy INSERT + trigger volet INSERT [modifié]
├── security_core.sql                        ← get_user_role versionnée (corps réel) [modifié]
├── {parking_realtime,pdj_breakfasts,pms_daily_metrics,rapro_rooms,rapro_sheets,
│    caisse_sheets}.sql                       ← policies dupliquées retirées + search_path [modifiés]
├── rapro_rooms.sql                          ← drop cascade neutralisé              [modifié]
├── daily_reports_occ_fn.sql                 ← fonction occ minimale pour rapro     [nouveau]
├── page_permissions_rls_lectures.sql        ← daily_reports SELECT = repjour seul  [modifié]
├── email_recipients_email_format.sql        ← CHECK décommenté                     [modifié]
└── page_permissions.sql                     ← set_user_grade garde dernier admin   [modifié]

supabase/functions/
├── send-report/index.ts                     ← rate limit + erreurs génériques      [modifié]
└── create-user/index.ts                     ← rollback borné + erreurs génériques  [modifié]

doc/pentest-2026-08-04/
├── etat-base-2026-08-04.md                  ← dump pg_policies + définitions        [nouveau]
└── retest-2026-08-XX.md                     ← clôture finding par finding           [nouveau]
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Client / front | `GalaxyChart.tsx`, `supabase.ts`, 5× `analytique.$year.$month.tsx` | `lib/shared/routeParams.ts` |
| DB / Supabase (exécuté par l'utilisateur) | `profiles.sql`, `security_core.sql`, 6× fichiers de table, `page_permissions_rls_lectures.sql`, `email_recipients_email_format.sql`, `page_permissions.sql` | `daily_reports_occ_fn.sql` |
| Edge Functions (déployées par l'utilisateur) | `send-report/index.ts`, `create-user/index.ts` | — |
| Documentation | `doc/pentest-2026-08-04.md` | `etat-base-2026-08-04.md`, `retest-2026-08-XX.md` |
| **Total** | **~17 modifiés** | **~3 nouveaux** |

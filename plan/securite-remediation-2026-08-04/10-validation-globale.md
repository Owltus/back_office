# Étape 10 — Validation globale et re-test daté

## Objectif

Prouver que chaque finding du pentest 2026-08-04 est clos (ou explicitement
accepté), sur la base LIVE, avec un compte jetable — jamais sur des données de prod.
C'est le livrable qui manquait aux deux plans précédents (jamais re-testés).

## Contexte

Étape critique de clôture : l'exécution seule ne suffit pas, il faut vérifier
l'effet réel en base et en prod, puis dater le re-test. Sans ça, on retombe dans le
piège organisationnel (plans écrits, jamais confirmés appliqués).

## Fichier(s) impacté(s)

- `doc/pentest-2026-08-04/retest-2026-08-XX.md` (nouveau)
- `CLAUDE.md` (faits DB, si un invariant change)
- `MEMORY.md` + mémoire projet (statut du chantier)

## Travail à réaliser

### 1. Matrice de re-test finding par finding

Sur un **compte jetable** (créé pour le test, supprimé après), vérifier :

| Finding | Test | Attendu |
|---|---|---|
| C1/E2 | Nom d'émetteur avec `<img onerror>` -> survol arête galaxie | Texte littéral, pas d'exécution |
| E1 | `insert profiles(role='admin')` en non-admin (PostgREST) | Forcé `utilisateur` ou rejeté |
| M1 | Rejeu mental d'un fichier de table | Aucune policy recréée |
| M2 | Compte rapro-only : `select * from daily_reports` | 0 ligne ; RPC occ OK |
| M3 | `rapro_rooms.sql` | Ne peut plus drop la table par rejeu |
| F2 | `insert email_recipients('a@b?x=1')` | Rejeté par CHECK |
| F3 | `pg_get_functiondef(get_user_role)` vs `security_core.sql` | Identiques |
| F4 | Linter 0011 sur les fonctions stamp | 0 |
| F5 | `send-report` en boucle | Refus au-delà du seuil |
| F6 | `create-user` rollback avec uid arbitraire | Refus |
| I3 | Login | OK avec `detectSessionInUrl:false` |
| I5 | `/repjour/analytique/abc/xyz` | Repli mois courant |
| I6 | Rétrograder le dernier admin | Refus |

### 2. Consigner le résultat

Écrire `retest-2026-08-XX.md` : chaque finding -> CLOS / ACCEPTÉ (risque résiduel
documenté, ex. F1 tokens localStorage) / REPORTÉ (avec raison).

### 3. Mettre à jour la documentation

- `CLAUDE.md` (section « Faits base de données ») si un invariant a changé.
- Mémoire projet : marquer le chantier terminé + archiver les deux plans précédents.

## Ordre d'exécution

1. Dérouler la matrice sur compte jetable.
2. Écrire le re-test daté.
3. Supprimer le compte jetable.
4. Mettre à jour doc + mémoire.

## Critère de validation

- Chaque ligne de la matrice a un verdict.
- Aucun finding « ouvert » sans décision explicite.
- `pnpm build` + `npx tsc --noEmit` + suite de tests au vert sur la branche finale.

## Contrôle /borg

Audit final transverse : (1) aucune régression fonctionnelle introduite par les
durcissements (RepJour, rapro, parking, caisse, facturation testés sur compte
jetable) ; (2) aucune policy nécessaire retirée ; (3) le re-test couvre bien les 13
findings du rapport ; (4) les objets versionnés (`profiles`, `get_user_role`)
correspondent au live.

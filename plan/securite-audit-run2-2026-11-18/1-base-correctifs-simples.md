# Étape 1 — Six correctifs de base sans risque pour l'existant

## Objectif

Corriger trois des quatre failles confirmées (la quatrième, le planning, est à l'étape 3) et trois défauts voisins. Ces corrections touchent seulement des fonctions et des triggers, sans flag de livraison.

## Fichier(s) impacté(s)

- `supabase/migrations/20261118100000_repjour_auto_sent_at_fige.sql` (nouveau)
- `supabase/migrations/20261118110000_pdj_cle_ligne_importee_figee.sql` (nouveau)
- `supabase/migrations/20261118120000_profiles_dernier_admin.sql` (nouveau)
- `supabase/migrations/20261118130000_planning_ferie_chome_proposition.sql` (nouveau)
- `supabase/migrations/20261118140000_pms_metrics_journal_et_destinataires.sql` (nouveau)
- `supabase/tests/93_audit_2026_11_18.test.sql` (nouveau)
- `supabase/tests/00_socle.test.sql` (liste des aides `private`, si une aide est ajoutée)
- `scripts/livrer-plan.mjs` (`TESTS_SUR_COPIE`) et `scripts/livrer-plan.test.ts`

## Travail à réaliser

### 1. `auto_sent_at` figé pour l'app

`create or replace function public.daily_reports_stamp()` (dernière définition : baseline:1793). Quand `auth.uid()` n'est pas null, l'UPDATE garde `old.auto_sent_at` et l'INSERT force null. L'estampille `imported_by` reste.

Chemins légitimes vérifiés : `autoSend.ts` et `marker.ts` passent par la clé secrète. Le client n'envoie jamais `auto_sent_at`.

### 2. PDJ : clé d'une ligne importée figée

`public.pdj_breakfasts_manual_kind_fige()` (regles_ecriture:57). Hors gestion et hors contexte système, si `old.manual_kind is null` et que `room` ou `service_date` change (`is distinct from`) : 42501.

L'upsert du client sur `service_date,room` renvoie les mêmes valeurs, il passe donc.

### 3. Dernier administrateur

- Créer un trigger `private.profiles_garde_dernier_admin`, `BEFORE UPDATE OF role OR DELETE`, avec `pg_advisory_xact_lock(hashtext('profiles:admins'))`.
- Comparaison avec `is distinct from 'admin'`, jamais `<>`.
- Garder le contrôle dans `set_user_grade` (message testé dans `02_rpc_privilegiees`).
- Dans `prevent_self_role_change`, figer aussi `created_at` sur UPDATE.

### 4. `ferie_chome` reste une proposition

`private.planning_absence_epinglee` (motifs_equite:84) : remplacer `m.role = 'ferie_rattrape'` par `m.role in ('ferie_rattrape','ferie_chome')`. Les lignes déjà en prod ne sont pas réécrites.

### 5. Journal des suppressions de `pms_daily_metrics` et destinataires réservés à la gestion

- `create trigger audit_pms_daily_metrics_delete before delete on public.pms_daily_metrics for each row execute function private.log_delete();`
- Recréer sous le même nom la policy `"srr read (page:repjour)"` (baseline:5561) avec `private.get_page_level('repjour') = 'gestion'`. Vérifier d'abord que `send-report` lit la liste avec la clé secrète.

### 6. Test pgTAP 93

Même structure que `91_audit_rls` : `t_compte`, `pg_temp.en_tant_que`, `pg_temp.essai`. Cas à couvrir :

- un compte en écriture ne change pas `auto_sent_at` ;
- un insert de ce compte le met à null ;
- le contexte système le pose ;
- déplacer la chambre d'une ligne importée donne 42501, la gestion le peut ;
- mise à jour directe du dernier admin : 42501 ;
- un admin parmi deux peut se rétrograder ;
- suppression du dernier admin : 42501 ;
- `created_at` reste figé ;
- `ferie_chome` avec `epinglee=false` reste false ;
- la suppression d'une ligne `pms_daily_metrics` écrit une ligne `DELETE` dans le journal ;
- un compte repjour en lecture ne lit pas les destinataires.

Ajouter le fichier à `TESTS_SUR_COPIE`.

## Ordre d'exécution

1. Écrire les 5 migrations (en-tête en français : symptôme, cause, correctif, innocuité).
2. `npx supabase migration up --local`.
3. Écrire le test 93, puis `pnpm test:db`.
4. Vérifier chaque garde par une mutation à la main : la retirer doit faire échouer le test.
5. `pnpm commit`.

## Critère de validation

- `pnpm test:db` est vert, le test 93 compris.
- `verif_advisor.sql` et `verif_classeur_acces.sql` sont toujours OK en local.
- L'écran /comptes, l'import PDJ manuel et l'envoi du rapport en local se comportent comme avant.

## Contrôle /borg

- Aucun trigger ne bloque un chemin `auth.uid() is null` (import de nuit, `delete-user`).
- La suppression en cascade depuis `auth.users` d'un compte non admin passe toujours.
- Aucune garde n'utilise `<>` sur un rôle.

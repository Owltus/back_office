# Plan — Correctifs de l'audit Supabase du 2026-09-06

> **EXÉCUTÉ le 2026-09-06** (5/5 étapes, 4 scripts SQL appliqués en prod,
> `verif_audit_2026-09-06.sql` 20/20 + advisor/complet/perf OK, 491 tests,
> build vert). Écarts par rapport au plan initial : colonne générée `code`
> abandonnée après mesure (5 ms à froid) ; complément
> `fk_auteur_triggers_2026-09-06.sql` (les triggers d'estampillage cassaient
> le SET NULL → `private.keep_author`). `track_io_timing` et
> `log_min_duration_statement` : IMPOSSIBLES sur ce plan (clés refusées par
> l'API postgres-config, ALTER DATABASE refusé, postgres non superuser).
> Démarrage vérifié dans le navigateur : 1 appel `get_my_access`, 0 lecture
> séparée profil/droits, 0 erreur console.

## Contexte

L'audit exploratoire du 2026-09-06 (4 agents en lecture seule : sécurité,
structure, données, performance) a suivi le chantier Security Advisor du
2026-09-05. Il a révélé **une régression de sécurité** (5 tables de facturation
lisibles par tout compte connecté, policy `using (true)` venue du fichier de
rollback rejoué), une charge de fond dominée par Realtime (80 % du CPU base,
conservée par décision), des requêtes PDJ lourdes (purge des noms rejouée à
chaque visite, 1 906 appels × 152 ms pour 0 ligne à purger), un boot auth en
deux requêtes (68 % des appels REST) et un lot d'hygiène (FK d'auteur, CHECK,
index doublon, policies `to public`, fonctions trigger exposées à `anon`).

L'utilisateur a tranché chaque point (voir « Décisions actées ») avec pour
règle : **l'approche la plus simple qui règle le problème, rien de plus**.
L'app n'est pas utilisée avant midi : les scripts SQL sont joués dans cette
fenêtre, groupés (chaque DDL recharge PostgREST ~1 s).

Contraintes : base de PRODUCTION (destructif = confirmation, fichiers
`supabase/*.sql` commités avant application, essai à blanc `begin … rollback`,
preuves par rôle) ; toute fonction `security definer` vit dans `private` ;
gardes `is distinct from` / `page_level_rank(...) >= n`.

---

## Remise en question (à défaut de /rodin)

- **Est-ce le bon chantier ?** Oui pour la régression facturation (fuite
  réelle, correctif de 5 lignes). Le reste est de l'hygiène et de la perf de
  fond ; rien n'est urgent mais tout est petit, et le créneau est libre.
- **Alternative moins coûteuse ?** Pour la purge PDJ : un index partiel +
  un verrou côté client une fois par jour, au lieu d'un cron (pg_cron non
  installé). Pour le « dernier jour PDJ » : déjà résolu le 2026-09-05 (les
  935 appels lents sont l'ancien chemin, statistiques historiques).
- **Angle mort** : deux décisions de l'utilisateur ont un effet de bord
  métier découvert par la reconnaissance (import RepJour en upsert, remboursement
  de caution J+1). Elles sont remontées avant exécution, pas lissées.

---

## Décisions actées (validées le 2026-09-06)

- **Facturation** : dropper les 5 policies `… read (authenticated)`.
- **Hygiène** : 4 triggers definer hors de `public` (3 passent invoker,
  `log_delete` va dans `private` car `audit_log` n'a pas de policy INSERT) ;
  revoke PUBLIC/anon sur les 8 fonctions trigger ; les 6 policies `to public`
  réécrites `to authenticated` (appels enveloppés).
- **RepJour** : UPDATE/DELETE de `daily_reports` et `pms_daily_metrics`
  INCHANGÉS (tranché après divergence : l'import est un upsert, l'écriture
  doit pouvoir ré-importer).
- **Compte de test, compte Réception, admin unique sans MFA** : inchangés.
- **Rôle `super_utilisateur`** : retiré du CHECK (0 profil concerné).
- **Cautions** : UPDATE fenêtré à 30 jours (`taken_date >= current_date - 30`),
  DELETE inchangé (tranché après divergence : remboursement J+1).
- **Pages autorisées** : CHECK sur les 8 clés de `src/lib/permissions/pages.ts`.
- **Suppression de compte** : FK d'auteur `on delete set null` (3 existantes
  corrigées + 15 créées, 0 orphelin) ; cible `profiles` pour les nouvelles ;
  NOT NULL levé sur les 5 colonnes concernées (tranché).
- **Index** : seul le doublon `parking_tarifs_effective_from_idx` est retiré.
- **Temps réel** : conservé partout ; seul l'abonnement mort du RepJour
  (`daily_reports`, table non publiée) est retiré, remplacé par un refetch au
  retour d'onglet avec écart minimal.
- **Requêtes PDJ** : index partiel + verrou client pour la purge ; colonne
  générée `code` + index pour `pdj_daily_agg` ; clés de cache fusionnées ;
  `fetchRange` mort retiré.
- **Boot auth** : une RPC invoker `get_my_access()` remplace les deux lectures.
- **Surveillance** : `idle_in_transaction_session_timeout` par ALTER ROLE ;
  `track_io_timing` et `log_min_duration_statement` impossibles (superuser,
  clés refusées par l'API) ; statistiques remises à zéro.
- **Archivage CSV** : déjà retiré du code (commit 575bbdd) ; plans annotés.
- **email_recipients** : lue par du code mort uniquement → table droppée,
  code mort retiré (`lib/repjour/email.ts`, `html2canvas`).
- **Literie** : stock cohérent avec les mouvements (0 + 26 − 16 = 10) →
  aucun recalcul ; commentaires périmés corrigés.
- **Sans action** : parking « réservé », brouillons de caisse, montants
  négatifs, avoirs PDJ groupe, doublons PMS (fidèles au fichier source),
  chambre 302, contresignature papier, compte sans page, 7 petits index,
  journal d'audit (élargissement = chantier futur).

---

## Angles à clarifier (tranchés le 2026-09-06)

1. **UPDATE `daily_reports` / `pms_daily_metrics` en gestion** : l'import
   RepJour fait un upsert (INSERT … ON CONFLICT DO UPDATE). Réserver l'UPDATE
   à la gestion empêche un profil `ecriture` de ré-importer une journée déjà
   importée (mode manuel du 2026-09-03). *Tranché : ne rien changer.*
2. **UPDATE `caisse_cautions` fenêtré sur `taken_date = current_date`** : le
   remboursement est un UPDATE ; une caution prise la veille ne pourrait plus
   être remboursée par un profil `ecriture`. *Tranché : fenêtre de 30 jours sur l'UPDATE, DELETE inchangé.*
3. **5 colonnes d'auteur NOT NULL** (`caisse_sheets.created_by` 161 lignes,
   `literie_stock_movements.created_by` 84, `baby_cot_assignments.created_by`,
   `caisse_cautions.created_by`, `literie_sheets.created_by`) : `set null`
   exige de lever le NOT NULL. *Tranché : lever le NOT NULL.*

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-sql-securite-hygiene.md](./1-sql-securite-hygiene.md) | Script sécurité + hygiène (policies, triggers, CHECK, FK, index) | — | P0 | 2h | `securite_audit_2026-09-06.sql` appliqué, preuves par rôle | ⚠ |
| 2 | [2-sql-performance.md](./2-sql-performance.md) | Script perf (index partiel, colonne `code`, RPC boot, réglages) | 1 | P1 | 1h30 | `perf_audit_2026-09-06.sql` appliqué, plans vérifiés | ⚠ |
| 3 | [3-front-performance.md](./3-front-performance.md) | Front : RPC boot, purge une fois par jour, clés fusionnées, RepJour sans canal mort | 2 | P1 | 1h30 | tsc + tests + build verts | |
| 4 | [4-nettoyage.md](./4-nettoyage.md) | Drop `email_recipients` + code mort, literie, plans caducs | 1 | P2 | 45 min | table droppée, `html2canvas` retiré | ⚠ |
| 5 | [5-validation-globale.md](./5-validation-globale.md) | Contrôles SQL 3 fichiers + `verif_audit_2026-09-06.sql`, commit | 1-4 | P0 | 30 min | tout OK, commit | ⚠ |

---

## Ordre d'exécution

1. Étape 1 : écrire et commiter le script, essai à blanc, application, preuves
   par rôle (compte sans droit facturation lit 0 ligne ; `ecriture` ré-importe
   selon la décision de l'angle 1).
2. Étape 2 : idem (mesure `explain analyze` avant/après sur `pdj_daily_agg`).
3. Étape 3 : code front, `npx tsc --noEmit`, `pnpm test`, `pnpm build`.
4. Étape 4 : sauvegarde des 8 lignes hors dépôt, `drop table` (destructif,
   décidé), code mort retiré.
5. Étape 5 : `verif_advisor.sql`, `verif_complet.sql`, `verif_perf.sql`,
   nouveau `verif_audit_2026-09-06.sql`, commit (push sur demande).

---

## Architecture cible

```
supabase/
  securite_audit_2026-09-06.sql        [nouveau]  policies, triggers, CHECK, FK, index
  perf_audit_2026-09-06.sql            [nouveau]  index partiel, colonne code, get_my_access, ALTER ROLE
  email_recipients_drop_2026-09-06.sql [nouveau]  drop table (destructif)
  verif_audit_2026-09-06.sql           [nouveau]  contrôles du chantier
  page_permissions_rls_lectures_ROLLBACK.sql [modifié] en-tête REMPLACÉ — NE PLUS REJOUER
  perf_2026-09-05.sql                  [modifié]  alter function private.get_user_role
  lint_hardening_2026-09-05.sql        [modifié]  boucle étendue aux fonctions trigger
  profiles.sql, affiche_templates.sql, parking_rls_fenetre_7j.sql,
  parking_tarifs.sql, caisse_cautions.sql, literie.sql, …  [modifiés] en-têtes d'autorité
src/
  lib/auth/access.ts                   [nouveau]  fetchMyAccess() + réduction
  components/auth/AuthContext.tsx      [modifié]  une seule lecture au boot
  lib/pdj/service.ts                   [modifié]  purge une fois par jour, fetchRange retiré
  components/pdj/BreakfastBoard.tsx    [modifié]  clé ['pdj','agg-all'] fusionnée
  components/repjour/boards/DashboardBoard.tsx [modifié] canal mort retiré, refetch visibilité
  lib/repjour/email.ts                 [supprimé]
  lib/repjour/services/recipients.ts   [modifié]  serverReportRecipients seul
```

---

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| SQL Supabase | 12 | 4 |
| Front | 9 | 1 |
| Documentation | 4 | 6 |
| **Total** | **25 modifiés** | **11 nouveaux** |

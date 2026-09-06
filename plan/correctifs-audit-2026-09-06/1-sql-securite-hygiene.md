# Étape 1 — Script sécurité et hygiène

## Objectif

Un seul script `supabase/securite_audit_2026-09-06.sql`, idempotent, qui ferme
la régression facturation et applique les décisions d'hygiène : triggers hors
du modèle definer-dans-public, fonctions trigger fermées à `anon`/PUBLIC,
policies `to public` réécrites, fenêtres RepJour et cautions, CHECK rôle et
pages, FK d'auteur `on delete set null`, index doublon retiré.

## Contexte

Points vérifiés en prod par la reconnaissance : les 5 policies `using (true)`
viennent de `page_permissions_rls_lectures_ROLLBACK.sql` (lignes 58-62) ; la
boucle de `lint_hardening_2026-09-05.sql` excluait les fonctions trigger, d'où
8 fonctions `=X` PUBLIC ; `log_delete` insère dans `audit_log` qui n'a pas de
policy INSERT (definer obligatoire, donc `private`) ; `log_delete` n'est
versionné nulle part (à récupérer par `pg_get_functiondef`) ; `profiles.sql`
porte une version de `prevent_self_role_change` antérieure à la prod.

## Fichier(s) impacté(s)

- `supabase/securite_audit_2026-09-06.sql` (nouveau)
- `supabase/page_permissions_rls_lectures_ROLLBACK.sql` (modifié : en-tête REMPLACÉ)
- `supabase/lint_hardening_2026-09-05.sql` (modifié : boucle sans filtre trigger)
- `supabase/profiles.sql`, `supabase/affiche_templates.sql`,
  `supabase/affiche_owner_model.sql`, `supabase/parking_rls_fenetre_7j.sql`,
  `supabase/page_permissions_rls.sql`, `supabase/parking_tarifs.sql`,
  `supabase/caisse_cautions.sql`, `supabase/page_permissions_rls_repjour.sql`
  (modifiés : en-têtes d'autorité)
- `supabase/perf_2026-09-05.sql` (modifié : `private.get_user_role`)

## Travail à réaliser

### 1. Facturation

```sql
drop policy if exists "issuers read (authenticated)" on public.facturation_issuers;
-- idem issuer_codes, issuer_denylist, learned_docs, wordpool
```

### 2. Triggers

- `affiche_stamp`, `parking_no_past_rewrite`, `prevent_self_role_change` :
  `alter function … security invoker` (n'appellent que `auth.uid()` et des
  aides `private` déjà accordées à `authenticated`).
- `log_delete` : `alter function public.log_delete() set schema private`
  (les triggers référencent l'OID, ils survivent).
- Boucle : pour toute fonction retournant `trigger` dans `public`/`private`,
  `revoke execute … from public, anon, authenticated` (un trigger s'exécute
  avec les droits du propriétaire de la table, pas de l'appelant).

### 3. Policies `to public`

Les 6 (`Admin reads audit log`, `Admin reads all profiles`,
`Admin manages profiles`, `Users read own profile`, `All read config`,
`Admin updates config`) sont recréées `to authenticated`, appels enveloppés
`(select private.get_user_role())`.

### 4. Fenêtres et CHECK

- `daily_reports` / `pms_daily_metrics` : selon l'angle 1 (DELETE en gestion,
  UPDATE selon décision).
- `caisse_cautions` UPDATE : selon l'angle 2.
- `profiles_role_check` → `('utilisateur','admin')`.
- `user_page_permissions_page_check` → 8 clés de `pages.ts`.

### 5. FK d'auteur

- 3 existantes : `drop constraint` + `add constraint … on delete set null`
  (même cible qu'avant).
- 15 nouvelles vers `public.profiles(id) on delete set null`, `not valid` puis
  `validate constraint` (0 orphelin vérifié) ; NOT NULL levé selon l'angle 3.

### 6. Index

`drop index if exists public.parking_tarifs_effective_from_idx` (le `_key`
unique couvre le tri par balayage arrière).

### 7. Fichiers d'autorité

En-têtes « REMPLACÉ — NE PLUS REJOUER » ou notes d'autorité sur les fichiers
listés, correction de `perf_2026-09-05.sql` (rejeu cassé).

## Ordre d'exécution

1. Écrire le script, `git add` + commit.
2. Essai à blanc : `begin; \i script; rollback` (via `-f` avec en-tête/pied).
3. Application `supabase db query --linked -f`.
4. Preuves par rôle en transaction annulée : un compte sans droit facturation
   lit 0 ligne de `facturation_issuers` ; `ecriture` peut/ne peut pas mettre à
   jour `daily_reports` selon l'angle 1.

## Critère de validation

- `verif_advisor.sql` 11/11, `verif_complet.sql` 20/20.
- `select count(*) from pg_policies where qual = 'true' and tablename like 'facturation%'` = 0.
- 0 fonction trigger avec `has_function_privilege('anon', oid, 'execute')`.
- 0 policy `roles = '{public}'` dans `public`.
- 18 FK d'auteur en `confdeltype = 'n'`.

## Contrôle qualité (revue)

Étape critique (policies, triggers, contraintes sur base de prod). `/borg`
n'étant pas installé, revue manuelle : (1) diff des policies avant/après ;
(2) `pg_trigger` intact (24 triggers, mêmes tables) ; (3) essai d'INSERT
`profiles` avec `role = 'super_utilisateur'` refusé ; (4) essai de suppression
d'un profil jetable en transaction annulée : aucune violation FK.

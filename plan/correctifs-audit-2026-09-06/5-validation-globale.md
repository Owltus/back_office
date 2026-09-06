# Étape 5 — Validation globale et commit

## Objectif

Prouver que la base et le code sont dans l'état cible, versionner un contrôle
dédié au chantier, mettre à jour `CLAUDE.md` et la mémoire, commiter.

## Fichier(s) impacté(s)

- `supabase/verif_audit_2026-09-06.sql` (nouveau)
- `supabase/verif_advisor.sql`, `supabase/verif_complet.sql`,
  `supabase/verif_perf.sql` (rejoués, éventuellement étendus)
- `CLAUDE.md` (modifié : faits base de données)

## Travail à réaliser

### 1. `verif_audit_2026-09-06.sql`

Contrôles (controle, verdict) : 0 policy `using (true)` sur facturation ;
0 fonction trigger exécutable par anon/PUBLIC ; 0 policy `{public}` ;
`log_delete` dans `private` ; 3 triggers invoker ; CHECK rôle à 2 valeurs ;
CHECK pages à 8 valeurs ; 18 FK auteur `set null` ; index doublon absent ;
index partiel présent ; colonne `code` présente ; `get_my_access` invoker,
non exécutable par anon ; `email_recipients` absente ;
`idle_in_transaction_session_timeout` posé sur `authenticated`.

### 2. Suite locale

`npx tsc --noEmit`, `pnpm test`, `pnpm lint`, `pnpm build`.

### 3. Documentation

`CLAUDE.md` : section « Faits base de données » (FK auteur, CHECK, RPC boot,
colonne `code`, table supprimée) ; mémoire `audit-supabase-2026-09-06.md`
passée à l'état « corrigé » ; liste des actions dashboard restantes pour
l'utilisateur (`track_io_timing`, `log_min_duration_statement`, reset stats
si échec).

## Critère de validation

- 4 fichiers de contrôle : tout OK.
- Commit(s) sur `main`, arbre propre. Push sur demande explicite.

## Contrôle qualité (revue)

Étape critique (dernière étape). Revue manuelle : relire le diff complet
`git diff HEAD~N`, vérifier qu'aucun fichier SQL rejouable ne recrée un objet
supprimé ou déplacé (grep `create or replace function public.log_delete`,
`create policy "issuers read (authenticated)"`, `email_recipients`).

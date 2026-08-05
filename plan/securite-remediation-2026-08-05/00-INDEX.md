# Plan — Remédiation sécurité (pentest #2 du 2026-08-05)

## Contexte

Le second pentest (rapport `doc/pentest-2026-08-05/pentest-2-2026-08-05.md`, 7 agents,
angles neufs) a remonté des failles NON couvertes par le premier, regroupées en
cinq thèmes : confiance inter-admin sans audit, over-posting sur colonne d'identité
oubliée, apprentissage facturation non idempotent, rémanence de facturation rapro,
durcissement config (HSTS, CSP, deps). Les contrôles en base live sont FAITS et
propres (REPLICA IDENTITY `default`, aucun bucket Storage, `daily_reports` hors
Realtime).

Ce plan est organisé selon la demande : **séparation stricte par responsable** —
ce que l'assistant peut faire seul (code, scripts, commits) d'un côté ; ce qui
revient à l'utilisateur (exécuter le SQL, déployer, régler le dashboard) de
l'autre, avec un guidage pas à pas pour chacune de ses étapes.

Contraintes reconduites : le SQL est **exécuté par l'utilisateur** (l'assistant
produit UN script consolidé + UN script de vérif) ; les Edge Functions sont
**déployées par l'utilisateur** ; les réglages GoTrue sont dans le dashboard
Supabase (utilisateur).

## Répartition des rôles

### CE QUE FAIT L'ASSISTANT (aucune action de ta part)
- Écrire le script SQL consolidé + le script de vérification.
- Modifier le code (config Vercel, `package.json`, Edge Function, code métier rapro/facturation/caisse).
- Committer et pousser tout le code.

### CE QUE TU FAIS (guidage pas à pas dans les fiches 5, 6, 7)
- Exécuter 2 scripts SQL dans Supabase → SQL Editor (copier-coller-Run).
- Déployer les Edge Functions (une commande).
- Régler 3 options dans le dashboard Supabase (clic à clic).

## Phases

| # | Fichier | Qui | Phase | Dépend de | Priorité | Critique |
|---|---------|-----|-------|-----------|----------|----------|
| 1 | [1-sql-consolide.md](./1-sql-consolide.md) | ASSISTANT | Script SQL unique : A2/A3/A4/B2/B7 + RPC idempotente A1 + script de vérif | — | P0 | ⚠ |
| 2 | [2-config-front.md](./2-config-front.md) | ASSISTANT | `vercel.json` (HSTS A6, CSP hash B11), `package.json` (B12), source map I3 | — | P1 | |
| 3 | [3-edge-delete-user.md](./3-edge-delete-user.md) | ASSISTANT | `delete-user` : messages d'erreur génériques (B3) | — | P2 | |
| 4 | [4-code-metier.md](./4-code-metier.md) | ASSISTANT | Client facturation vers RPC idempotente (A1), purge rémanence rapro (A5), float caisse (B10/C1) | 1 | P1 | |
| 5 | [5-toi-executer-sql.md](./5-toi-executer-sql.md) | TOI | Exécuter le script SQL consolidé + la vérif | 1 | P0 | ⚠ |
| 6 | [6-toi-deployer-edge.md](./6-toi-deployer-edge.md) | TOI | Déployer les Edge Functions | 3 | P2 | |
| 7 | [7-toi-reglages-supabase.md](./7-toi-reglages-supabase.md) | TOI | Dashboard : politique mot de passe, rate-limit, HaveIBeenPwned (A8) | — | P1 | |
| 8 | [8-validation-finale.md](./8-validation-finale.md) | ASSISTANT + TOI | Vérif finale + re-test daté + mémoire | 1-7 | P0 | ⚠ |

## Ordre d'exécution

1. **L'assistant d'abord** : fiches 1 → 2 → 3 → 4 (écrit scripts + code, commit, push).
2. **Puis toi** (quand l'assistant te le dit) : fiche 5 (SQL) → fiche 6 (déploiement) → fiche 7 (dashboard). Ces trois sont indépendantes entre elles, dans l'ordre que tu veux.
3. **Ensemble** : fiche 8 (vérif finale).

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB (exécuté par toi) | `page_permissions.sql`, `profiles.sql`, `caisse_sheets.sql`, `security_core.sql`, `security_hardening_triggers.sql`, migrations `rapro_rooms_status_*` | `remediation_securite_2026-08-05.sql`, `verif_securite_2026-08-05.sql`, RPC facturation |
| Config / front | `vercel.json`, `package.json`, `src/lib/theme.ts` (hash), code rapro/caisse | — |
| Edge Functions (déployées par toi) | `functions/delete-user/index.ts` | — |
| Client facturation | `src/lib/facturation/cloudService.ts`, `src/components/facturation/InvoicePanel.tsx` | — |
| Documentation | `doc/pentest-2026-08-05/` | `retest-2026-08-05.md` |

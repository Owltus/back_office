# Étape 5 — Validation + commits (+ notes config/SQL)

## Objectif

Valider l'ensemble, committer proprement, et lister les actions de config restantes.

## Travail à réaliser

### 1. Validation technique

```bash
deno check --node-modules-dir=auto supabase/functions/import-report/index.ts
deno check --node-modules-dir=auto supabase/functions/send-report/index.ts
npx tsc --noEmit
pnpm build
```

Vérifier qu'il ne reste AUCUNE référence PDJ-e-mail :
```bash
# doit ne rien retourner (hors historique/plan) :
rg "sendPdjViaServer|maybeAutoSendPdj|buildPdjEmailHtml|pdjReportRecipients|fetchPdjSent|PDJ_REPORT_FROM|PDJ_TEST_NO_PDF" src supabase/functions
```

### 2. Commits organisés (sans push sauf demande)

- `refactor(edge): retire l'envoi auto du PDJ (import-report)` — étape 1
- `refactor(edge): send-report redevient RepJour-only` — étape 2
- `refactor(pdj): retire l'UI e-mail de la page (envoi/bandeau/destinataires)` — étape 3
- `refactor(pdj): supprime le code e-mail client (sendServer, reportHtml, jsPDF)` — étape 4
- `docs(plan): retrait de l'envoi e-mail du PDJ` — plan/

### 3. Déploiement (utilisateur)

```bash
supabase functions deploy import-report --no-verify-jwt
supabase functions deploy send-report
```
Front : redéploiement Vercel (auto sur push).

### 4. Config à nettoyer (utilisateur, optionnel)

- Secrets devenus inutiles : `supabase secrets unset PDJ_REPORT_FROM` et
  `supabase secrets unset PDJ_TEST_NO_PDF`.
- Tables SQL dormantes (`pdj_report_recipients`, `pdj_auto_send_log`) : LAISSÉES par
  défaut. Script `DROP` optionnel (destructif → confirmation) si tu veux nettoyer.

## Critère de validation

- `deno check` (x2), `npx tsc --noEmit`, `pnpm build` : tous OK.
- `rg` de contrôle : plus aucune référence PDJ-e-mail dans `src` / `supabase/functions`.
- `git status` propre après commits.

## Contrôle /borg

Étape critique (validation globale d'un RETRAIT). Vérifier :
- Le Rep Jour (e-mail auto + manuel + bandeau + destinataires) est INTACT.
- La page PDJ garde import In-House + affichage + IMPRESSION (CSS), et ne casse pas.
- Aucun import/type/variable orphelin ; aucune référence pendante au code supprimé.
- send-mail.ts / businessDay.ts / SendStatusBanner / RecipientsModal toujours
  fonctionnels pour le Rep Jour.

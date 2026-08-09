# Étape 2 — Edge : send-report redevient RepJour-only

## Objectif

`send-report` ne gère plus que le Rep Jour. Toute la branche `kind: 'pdj'` (et
l'interrupteur de test `PDJ_TEST_NO_PDF`) est retirée.

## Fichier(s) impacté(s)

- `supabase/functions/send-report/index.ts` (modifié)

## Travail à réaliser

### 1. Retirer la branche PDJ

- `from` : ne garder que `Deno.env.get('REPORT_FROM') ?? 'Rep Jour <onboarding@resend.dev>'`
  (supprimer le ternaire `kind === 'pdj' ? … : …`).
- `recipientsTable` : fixer à `'server_report_recipients'` (supprimer le ternaire).
- Retirer la lecture `kind` du corps (ou l'ignorer) et le champ `kind` du type `body`.
- Supprimer le bloc `PDJ_TEST_NO_PDF` (`skipPdf`) et remettre `pdfBase64` tel quel
  dans l'appel `sendMail`.

### 2. Marqueur d'envoi manuel

Le marqueur RepJour (`daily_reports.auto_sent_at`) reste posé. Retirer uniquement la
branche PDJ du marqueur (`kind === 'pdj'` → `pdj_auto_send_log`) : ne garder que la
pose de `auto_sent_at` pour la date reçue.

## Ordre d'exécution

1. Simplifier `from` + `recipientsTable`.
2. Retirer `kind`, `skipPdf` / `PDJ_TEST_NO_PDF`, la branche pdj du marqueur.

## Critère de validation

- `deno check --node-modules-dir=auto supabase/functions/send-report/index.ts` OK.
- Plus aucune occurrence de `pdj` dans `send-report/index.ts`.
- L'envoi manuel RepJour intact (garde admin, anti-spam, marqueur auto_sent_at).

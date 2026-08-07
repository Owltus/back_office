# Étape 2 — Porter le rendu e-mail RepJour côté serveur (Deno)

## Objectif

Pouvoir générer le corps HTML de l'e-mail RepJour DEPUIS une Edge Function (Deno),
à partir des données en base — sans dépendre du client.

## Qui

MOI.

## Décision liée

[B-PDF] : si PDF joint retenu → tenter le portage jsPDF (risque). Sinon, HTML seul
(cette étape suffit).

## Fichier(s)

- `supabase/functions/import-report/report-render.ts` (nouveau, module Deno)
- (référence, non modifié) `src/lib/repjour/reportHtml.ts`, `format.ts`,
  `summaryMetrics.ts`, `types.ts`, `calc/ecart.ts`, `sendServer.ts` (buildHtmlBody)

## Travail à réaliser

1. Recopier en Deno (comme `import-report/repjour.ts` l'a fait pour l'import) :
   `buildReportHtml` + `buildCards` (reportHtml.ts), `fmt` (format.ts), `monthPace`
   + `fmtJours` (summaryMetrics.ts), `computeEcart`, l'enveloppe `<!doctype html>`
   responsive + `REPORT_EMAIL_CONTAINER_STYLE` (sendServer.ts:57-91).
2. Écrire `buildEmailDataFromDb(admin, reportDate)` : reconstruit `EmailData`
   depuis `daily_reports` (jour + mois pour pickup/monthStartProjection) + `budget`.
   - `realiseJour/MTD/projeteMois` ← colonnes `rj_*`/`rmtd_*`/`pm_*`.
   - `ecart = computeEcart(pm, budget)`.
   - `pickup` = pm.roomRevenue du jour − pm.roomRevenue du rapport précédent du mois.
   - `monthStartProjection` = pm_room_revenue du 1er rapport du mois.
3. Exposer `buildRepjourEmail(admin, reportDate) -> { subject, html }`.
4. [B-PDF, si retenu] `buildRepjourPdfBase64` via `npm:jspdf` — valider les globals
   navigateur en Deno ; sinon abandonner le PDF (HTML seul).

## Critère de validation

- Sur un jour réel en base, le HTML généré côté serveur est identique (visuellement)
  à celui du bouton « Envoyer via serveur ».
- Test local possible (script Node/Deno) : le HTML contient les bons KPI.

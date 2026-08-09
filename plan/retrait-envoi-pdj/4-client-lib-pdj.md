# Étape 4 — Client : nettoyer lib/pdj + services

## Objectif

Supprimer le code e-mail PDJ côté client, en gardant les TYPES et tout ce qui sert à
l'affichage/impression.

## Fichier(s) impacté(s)

- `src/lib/pdj/sendServer.ts` (supprimé)
- `src/lib/pdj/reportHtml.ts` (supprimé)
- `src/lib/pdj/pdf.ts` (modifié : garder les types, retirer le jsPDF orphelin)
- `src/lib/pdj/service.ts` (modifié : retirer `fetchPdjSent`)
- `src/lib/repjour/services/recipients.ts` (modifié : retirer `pdjReportRecipients`)

## Travail à réaliser

### 1. Supprimer les fichiers e-mail PDJ

- `sendServer.ts` (envoi manuel PDJ) — plus aucun appelant après l'étape 3.
- `reportHtml.ts` (sujet + HTML e-mail PDJ).

### 2. `pdf.ts` : garder les types, retirer le jsPDF devenu orphelin

- CONSERVER les types `PdjSheetData`, `PdjStats` (utilisés par l'affichage / le board).
- Vérifier les usages de `buildPdjPdf` et `printPdjSheet` : après suppression de
  `sendServer.ts` + `reportHtml.ts`, s'ils ne sont plus appelés nulle part, les
  supprimer (le jsPDF ne servait qu'à l'e-mail ; l'impression passe par le CSS
  `printWithTitle`). Si un usage subsiste, le garder.

### 3. Retirer les services de destinataires / statut PDJ

- `service.ts` : supprimer `fetchPdjSent` (lecture `pdj_auto_send_log`).
- `recipients.ts` : supprimer l'export `pdjReportRecipients`. GARDER
  `serverReportRecipients` (Rep Jour) et `makeRecipientsService` (générique).

## Ordre d'exécution

1. Supprimer `sendServer.ts` + `reportHtml.ts`.
2. Nettoyer `pdf.ts` (types gardés, jsPDF orphelin retiré).
3. Retirer `fetchPdjSent` (service.ts) et `pdjReportRecipients` (recipients.ts).

## Critère de validation

- `npx tsc --noEmit` OK ; `pnpm build` OK.
- Aucune référence résiduelle à `sendPdjViaServer`, `buildPdjEmailHtml`,
  `pdjReportRecipients`, `fetchPdjSent`.
- Les types `PdjSheetData`/`PdjStats` toujours résolus (affichage OK).

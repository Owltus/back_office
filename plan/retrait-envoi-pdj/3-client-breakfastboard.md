# Étape 3 — Client : retirer l'UI e-mail de la page PDJ

## Objectif

La page PDJ (`BreakfastBoard`) n'a plus rien d'e-mail : ni bouton Envoyer, ni modal
de vérification, ni gestion des destinataires, ni bandeau « pas encore envoyé ». Elle
garde : sélection du jour, affichage de la feuille, saisie « PDJ servi », IMPRESSION.

## Fichier(s) impacté(s)

- `src/components/pdj/BreakfastBoard.tsx` (modifié)

## Travail à réaliser

Retirer de `BreakfastBoard.tsx` :
- l'import + l'usage de `RecipientsModal` (les deux blocs `service={pdjReportRecipients}`)
  et l'import `pdjReportRecipients`.
- l'import + l'usage de `ServerSendDialog` (le flux d'envoi manuel PDJ) et
  `sendPdjViaServer`.
- l'import + l'usage de `SendStatusBanner` (bandeau) et de `fetchPdjSent` / la query
  `['pdj','auto-send-log', …]` associée.
- le bouton « Envoyer » (groupe d'actions admin d'envoi serveur) et l'état associé
  (`showServerConfirm`, `serverSending`, `showServerRecipients`, etc. propres à l'e-mail).

GARDER : `printWithTitle` + `handlePrint` + le bouton Imprimer ; l'import In-House ;
l'affichage ; la saisie ; le type `PdjSheetData` (encore importé pour l'affichage).
Ne pas toucher au reste de la page.

## Ordre d'exécution

1. Retirer les imports e-mail (RecipientsModal, ServerSendDialog, sendPdjViaServer,
   SendStatusBanner, pdjReportRecipients, fetchPdjSent).
2. Retirer le JSX correspondant (bouton Envoyer, modales, bandeau).
3. Retirer les états/handlers devenus inutiles ; nettoyer les imports orphelins.

## Critère de validation

- `npx tsc --noEmit` OK (aucun import/variable orphelin).
- La page PDJ compile et garde import + affichage + impression.
- Aucune régression sur RepJour (fichiers non touchés).

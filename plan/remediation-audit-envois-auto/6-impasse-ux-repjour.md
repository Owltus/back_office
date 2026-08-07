# Étape 6 — Corriger l'impasse UX import RepJour

## Objectif

Supprimer le cul-de-sac où un compte écriture non-admin voit « Charge-le
ci-dessous » alors que la zone d'import est masquée (réservée grade admin).

## Contexte

`importOnly = !report && isImportDay && canImport && !isAdmin` reste vrai pour un
utilisateur `repjour:ecriture` sans `gestion` ni grade admin. La zone principale
affiche alors « Le rapport du … n'a pas encore été chargé. Charge-le ci-dessous. »
mais l'`<ImportSection>` en dessous ne se rend plus (gardée par `isGradeAdmin`).
L'ingestion étant désormais AUTOMATIQUE, le message doit refléter cela plutôt que
pointer vers un contrôle absent.

## Fichier(s) impacté(s)

- `src/components/repjour/boards/DashboardBoard.tsx`

## Travail à réaliser

### 1. Adapter la copie à l'ingestion automatique

Puisque l'import manuel est en sommeil (réservé grade admin, filet de secours), le
message destiné aux non-admins doit indiquer que le rapport arrivera
automatiquement, sans renvoyer vers un bouton inexistant. Deux options :

- (a) Modifier la copie de l'état « importOnly » pour un non-admin : « Le rapport
  du … sera importé automatiquement. » (pas d'invite « charge-le »).
- (b) OU inclure le gating de sommeil dans `importOnly` pour que la branche ne
  s'active que si un contrôle d'import est réellement rendu.

Retenir (a) : elle correspond à la réalité (ingestion auto) et reste informative.
Nettoyer aussi le commentaire d'en-tête périmé (`DashboardBoard.tsx:60-63`) qui
décrit encore l'ancien flux mailto « ouvert à tous ».

## Ordre d'exécution

1. Localiser la branche d'affichage `importOnly` et son texte.
2. Adapter la copie pour le cas non-admin.
3. Nettoyer le commentaire d'en-tête périmé.

## Critère de validation

- `npx tsc --noEmit` OK.
- Raisonnement : un non-admin en jour d'import ne voit plus d'invite vers un
  contrôle absent ; un admin garde l'`<ImportSection>` inchangée.

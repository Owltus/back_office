# Étape 7 — UI : couple, candidats par émetteur, réimport, historique

## Objectif

Répercuter le couple (code + compte) dans toute l'UI, mettre en avant la liste de candidats par émetteur, et ajouter deux écrans : réimport du référentiel et consultation de l'historique.

## Contexte

Les briques existent (CodePicker multi-sélection, ImputationList, IssuerCombobox, BudgetLinesManager, FacturationRevue). Il s'agit de les passer au couple et d'ajouter les deux écrans. `StatTile` (disponible, non utilisée en facturation) peut servir de bandeau de compteurs.

## Fichier(s) impacté(s)

- `src/components/facturation/CodePicker.tsx` (modification : afficher le compte, sélectionner le couple)
- `src/components/facturation/ImputationList.tsx` (modification : chips au couple)
- `src/components/facturation/InvoicePanel.tsx` (modification : section « Déjà utilisé pour {émetteur} » en tête)
- `src/components/facturation/ReferentielImport.tsx` (nouveau : dépôt fichier → RPC réimport, s'inspire de `src/components/repjour/ImportSection.tsx`)
- `src/components/facturation/HistoriqueDialog.tsx` (nouveau : consultation / export de l'historique)
- `src/components/facturation/BudgetLinesManager.tsx` et `FacturationRevue.tsx` (modification : couple)
- `src/lib/facturation/stampLayout.ts` et `stamp.ts` (modification : ligne = code + compte)

## Travail à réaliser

### 1. Couple partout

CodePicker : recherche et sélection par couple (afficher `code — compte — libellé`). ImputationList : chips `code + compte`. `stampLines` : une ligne = `code + compte` (le placeholder « — à imputer — » reste).

### 2. Candidats par émetteur

En tête du panneau d'imputation, section « Déjà utilisé pour {émetteur} » : les couples de `facturation_issuer_memory`, classés par fréquence, cliquables. Pré-sélection à l'arrivée d'un émetteur connu, **jamais** d'auto-validation.

### 3. Réimport

`ReferentielImport` : dépôt du fichier (JSON, `papaparse` si CSV), aperçu, confirmation (`useConfirm`), appel de la RPC. Emplacement : onglet dans `BudgetLinesManager` ou route dédiée `/facturation/referentiel`.

### 4. Historique

`HistoriqueDialog` : liste des factures imputées (émetteur, couples), filtre et export.

## Ordre d'exécution

1. Couple dans CodePicker / ImputationList / stamp.
2. Section candidats par émetteur.
3. Réimport, puis historique.

## Critère de validation

- `npx tsc --noEmit` + `pnpm build` OK.
- Parcours complet : dépôt PDF → émetteur reconnu → candidats proposés → choix d'un ou plusieurs couples → tampon (code + compte sur le PDF) → historique enregistré.
- Le réimport d'un fichier met à jour le catalogue sans redéploiement.

## Contrôle /borg

Étape critique (> 5 fichiers, cœur de l'expérience). Audit post-exécution :
- Aucune régression du tampon (position, calque OCG) avec le couple.
- Validation toujours manuelle (aucune imputation automatique).
- Le réimport « remplaçant » passe bien par la confirmation.

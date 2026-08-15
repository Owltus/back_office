# Étape 2 — Parcours d'imputation : garde-fou, compte visible et éditable

## Objectif

Fiabiliser le parcours interactif d'imputation d'une facture :

1. **garde-fou** : plus aucun tamponnage silencieux avec un compte manquant ;
2. **compte visible et éditable** dès le cochage d'un code dans `CodePicker` ;
3. **format unique** du couple dans les chips « déjà utilisé » et dans `ImputationList` ;
4. **cas du code sans compte** traité proprement (indicateur discret, cf. A3).

## Contexte

Trou principal (audit) : `canStamp = record.codes.length > 0` (`InvoicePanel.tsx:374`) ne
regarde jamais les comptes ; `InvoiceNotices`/`notices.ts` non plus. Dans `CodePicker`, un
code multi-comptes n'affiche que « N comptes » avant sélection (`CodePicker.tsx:238-242`) et
le compte ne se choisit qu'après cochage (`CodePicker.tsx:285-308`). Deux sources de vérité
« ce code a-t-il plusieurs comptes ? » cohabitent : `comptesForCode(code)` dans
`ImputationList` (`InvoicePanel.tsx:145`) vs `it.comptes` agrégé dans `CodePicker`
(`CodePicker.tsx:285`) — à harmoniser.

## Fichier(s) impacté(s)

- `src/components/facturation/InvoiceNotices.tsx`
- `src/components/facturation/InvoicePanel.tsx` (chips, `ImputationList`, `canStamp`)
- `src/components/facturation/CodePicker.tsx`

## Travail à réaliser

### 1. Garde-fou

- `InvoiceNotices.tsx` : afficher la notice `compte-manquant` produite à l'étape 1 (même
  gabarit visuel que les autres notices).
- `InvoicePanel.tsx` : selon A1.
  - variante **avertir** : `canStamp` inchangé ; la notice proéminente suffit.
  - variante **bloquer** : `canStamp = record.codes.length > 0 && missingComptes(...).length === 0`.
  Utiliser `missingComptes` (étape 1) avec `comptesForCode` comme résolveur, jamais une
  re-implémentation locale.

### 2. Compte visible et éditable dans `CodePicker`

- Ligne d'un code **multi-comptes** : au lieu de « N comptes » (`CodePicker.tsx:238-242`),
  afficher le compte actuellement retenu au format `formatImputation(code, compteRetenu)`,
  ou une mention explicite « compte à choisir » s'il est vide.
- Rendre le `Select` de compte accessible de façon cohérente : aujourd'hui il n'apparaît
  qu'après cochage (`CodePicker.tsx:285`). Garder ce comportement mais s'assurer que l'état
  « compte à choisir » est visible AVANT/PENDANT le cochage (pas de compte fantôme).
- Harmoniser la condition multi-comptes sur `comptesForCode(code)` (même source que
  `ImputationList`) pour supprimer la double vérité.

### 3. Format unique dans chips et `ImputationList`

- Chips « déjà utilisé pour cet émetteur » (`InvoicePanel.tsx:702-738`) : remplacer le rendu
  `code` + `compte` séparés par `formatImputation(cand.code, cand.compte)`.
- `ImputationList` (`InvoicePanel.tsx:144-168`) : le libellé du couple (hors `Select`
  d'édition) passe par `formatImputation`. Le `Select` d'édition reste inchangé.

### 4. Cas du code sans compte (A3)

- `ImputationList` / `CodePicker` : pour un code dont `comptesForCode(code).length === 0`,
  afficher un indicateur discret « pas de compte » (lecture seule, pas de saisie libre —
  l'édition du référentiel est hors périmètre). Ne PAS le compter dans `missingComptes`
  (déjà garanti à l'étape 1).

## Ordre d'exécution

1. Brancher la notice (`InvoiceNotices`) + `canStamp` (`InvoicePanel`) selon A1.
2. `CodePicker` : compte visible au cochage + harmonisation de la condition multi-comptes.
3. Format unique dans chips + `ImputationList`.
4. Indicateur « pas de compte ».

## Critère de validation

- `npx tsc --noEmit` propre.
- Recette manuelle : (a) une facture avec un code multi-comptes non renseigné déclenche
  l'avertissement (ou le blocage selon A1) ; (b) le compte est visible/éditable dans le
  picker ; (c) un code mono-compte s'affiche en lecture seule ; (d) un code sans compte
  montre l'indicateur discret sans jamais bloquer.

# Étape 6 — Éditeur du dictionnaire des comptes

## Objectif

Permettre au comptable (rôle gestion) de nommer et affiner les comptes, sans toucher au code.
C'est ce qui rend l'amorçage (étape 1) durable : les noms approximatifs deviennent justes au
fil de l'eau.

## Contexte

`BudgetLinesManager` (`BudgetLinesManager.tsx`) gère déjà le CRUD du référentiel couple, avec
recherche, groupage par section et gardes de suppression. `ReferentielImport` gère l'import de
masse. L'éditeur du dictionnaire se greffe dans le même écran (onglet ou dialog séparé) et
consomme les RPC de l'étape 1.

## Fichier(s) impacté(s)

- `src/components/facturation/BudgetLinesManager.tsx` (onglet/section « Comptes »)
- `src/components/facturation/ReferentielImport.tsx` (colonne libellé de compte, optionnelle)
- `src/lib/facturation/cloudService.ts` (rappel : RPC déjà ajoutées à l'étape 1/2)

## Travail à réaliser

### 1. Éditeur unitaire

Dans `BudgetLinesManager`, une vue « Comptes » listant les entrées de `facturation_ref_comptes`
(numéro + nom), avec :
- recherche par numéro ou nom ;
- édition du `libelle` (le `compte` = clé, non éditable, comme le couple l'est déjà) ;
- création d'un compte manquant (numéro + nom) ;
- suppression gardée : refus si le compte est encore référencé par un couple
  (`facturation_ref_imputations`) — message clair, réutilise la garde SQL de l'étape 1.
- Écritures via `facturation_ref_comptes_upsert`/`_delete`, puis invalidation de la query
  `['facturation','comptes']`.

### 2. Repérage des comptes non nommés

Mettre en évidence les comptes dont le `libelle` est encore l'amorçage brut / vide (ex. badge
« à nommer ») pour guider le travail du comptable. Optionnel mais utile.

### 3. Import du libellé (optionnel)

`ReferentielImport` : accepter une colonne `libelle_compte` (ou un second fichier
numéro→nom) routée vers `facturation_ref_comptes_reimport`. Ne pas bloquer l'import du
référentiel couple si la colonne est absente (rétrocompatibilité).

## Ordre d'exécution

1. Vue « Comptes » (liste + recherche + édition + création).
2. Suppression gardée + invalidation cache.
3. Repérage des comptes à nommer.
4. Import du libellé (si retenu).

## Critère de validation

- `npx tsc --noEmit` propre.
- Un compte renommé se reflète immédiatement dans le picker/ImputationList (cache invalidé).
- Suppression d'un compte encore référencé refusée avec message clair.
- Accès réservé au rôle gestion (garde UI + RLS serveur).

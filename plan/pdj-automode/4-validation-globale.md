# Étape 4 — Validation globale

## Objectif

Vérifier le chantier de bout en bout : compilation, tests, build, et scénarios manuels couvrant les décisions D2–D5. Confirmer qu'aucune régression n'est introduite sur la page PDJ (cases manuelles, vue financière, PDF, CA).

## Contexte

Dernière étape (validation post-chantier). L'automode réutilise `setServed` et n'ajoute aucun SQL : le risque résiduel porte sur l'écriture en masse et l'interaction clavier. Cette étape verrouille ces points avant livraison.

## Fichier(s) impacté(s)

- Aucun (vérification). Corrections éventuelles renvoyées vers les étapes 1-3.

## Travail à réaliser

### 1. Vérifications automatiques

- `npx tsc --noEmit` : propre.
- `npx vitest run` : toute la suite verte (dont `automode.test.ts`).
- `pnpm build` : OK, pas de nouveau chunk aberrant.

### 2. Scénarios manuels (navigateur, `/pdj?date=…`)

- Jour importé **vierge** + éditable : `automode` coche toutes les chambres facturées à leur dû ; compteur de retour cohérent ; CA PDJ inchangé.
- Jour **partiellement** saisi : chambres déjà cochées intactes (D3), seules les chambres facturées à `served === 0` sont complétées.
- Jour **sans PDJ inclus** : `automode` ne coche rien, message adapté.
- Jour **non éditable** (hors fenêtre J-3 pour un rôle `ecriture`) : message clair, aucune écriture ; en `gestion`, l'écriture passe (D4).
- Frappe `automode` **dans un champ** (recherche, mot-clé) : aucun déclenchement (garde focus).
- **Idempotence** : relancer `automode` : aucun changement, aucun extra.
- Bascule **vue financière** avant/après : mêmes montants ; **PDF** inchangé (feuille nominative).

### 3. Contrôle final

- Relire les décisions D1-D5 de l'index : chaque choix retenu est bien reflété dans le code.

## Ordre d'exécution

1. Lancer les vérifications automatiques.
2. Dérouler les scénarios manuels.
3. Si un écart est trouvé, corriger dans l'étape concernée et rejouer.

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run`, `pnpm build` : tous OK.
- Les 7 scénarios manuels passent.
- Aucune régression sur CA / vue financière / PDF / saisie manuelle.

## Contrôle /borg

Étape de validation globale (dernière étape). Auditer :
- Absence de régression sur les chemins d'écriture PDJ existants (`handleServe` / `handleManual` / import) — l'automode ne doit pas les altérer.
- Aucune écriture non gardée : toute persistance passe par `setServed` sous garde `dayEditable`.
- Pas d'écouteur clavier résiduel après démontage ; pas de capture parasite hors PDJ.
- Cohérence finale `computePdjCA` (le CA ne dépend que de `breakfasts_included`, inchangé par l'automode).

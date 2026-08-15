# Étape 4 — Validation globale

## Objectif

Vérifier que le chantier est cohérent de bout en bout : compilation, tests, build, et
recette fonctionnelle du parcours facturation avec le compte fiabilisé.

## Contexte

Dernière étape du plan : contrôle transverse après les modifications métier (étape 1),
parcours d'imputation (étape 2) et surfaces de lecture (étape 3). Aucune migration SQL
n'étant impliquée, la validation est purement front + métier.

## Fichier(s) impacté(s)

- Aucun (vérification uniquement ; corrections ponctuelles si un contrôle échoue).

## Travail à réaliser

### 1. Contrôles automatiques

```bash
npx tsc --noEmit
pnpm test        # ou la commande de test réelle du projet
pnpm build       # vérifier qu'aucun chunk ne casse
```

### 2. Recette bout en bout (manuelle)

- Facture avec un code **multi-comptes non renseigné** → avertissement (ou blocage selon A1)
  visible ; le compte se choisit dans le picker ; après choix, l'avertissement disparaît.
- Facture avec un code **mono-compte** → compte affiché en lecture seule, aucun avertissement.
- Facture avec un code **sans compte au référentiel** → indicateur discret, aucun blocage.
- Couple affiché de façon **homogène** sur : picker, chips « déjà utilisé », `ImputationList`,
  aperçu du tampon, PDF généré, historique.
- Tampon PDF : le compte apparaît correctement, alignement/troncature corrects.

### 3. Non-régression (hors périmètre à vérifier intact)

- La galaxie, `detect.ts`, l'apprentissage émetteur→code et la table
  `facturation_budget_lines` ne doivent PAS avoir changé de comportement.
- L'apprentissage à l'apposition du tampon (`learnInvoiceDocument`) continue de stocker
  `record.comptes` comme avant.

## Ordre d'exécution

1. Contrôles automatiques.
2. Recette manuelle.
3. Non-régression.

## Contrôle /borg

Étape critique (validation globale finale). `/borg` doit auditer :

- Cohérence de la source unique de format : aucun rendu du couple ne contourne
  `imputationParts`/`formatImputation` (grep résiduel `   ` / concaténations `code`+`compte`).
- Cohérence de la source unique du garde-fou : `canStamp` et les notices s'appuient sur
  `missingComptes`, sans re-implémentation locale de la règle « compte requis ».
- Aucune régression sur le périmètre explicitement différé (galaxie, détection,
  apprentissage émetteur, legacy `facturation_budget_lines`).
- Aucun `SUPABASE_SERVICE_ROLE_KEY` ni secret introduit ; aucune migration SQL non prévue.

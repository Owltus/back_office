# Étape 5 — Validation globale

## Objectif

Vérifier que l'ensemble (étapes 1 à 4) compile, passe les tests, se construit, et se
comporte correctement dans le navigateur — la partie SQL (étape 4) restant à exécuter
par l'utilisateur.

## Fichier(s) impacté(s)

- Aucun (étape de vérification).

## Travail à réaliser

### 1. Vérifications automatiques

```bash
npx tsc --noEmit
npx vitest run
pnpm build
```

Tous verts. Le TS doit builder même si `facturation_corrections.sql` n'a pas encore été
exécuté (dégradation gracieuse : les wrappers échouent proprement).

### 2. Vérification navigateur (scénarios)

Avec `pnpm dev` puis `/facturation` :

1. **Autocomplétion** (étape 1) : l'input émetteur suggère les émetteurs connus.
2. **Fuzzy** (étape 1) : saisir une variante proche → « Vouliez-vous dire X ? », clic → snap au nom canonique.
3. **Confirmation** (étape 2) : décocher « mémoriser » → tampon sans apprentissage ; coché → récapitulatif « sera mémorisé : émetteur → imputations » exact.
4. **Galaxie** (étape 3) : le bruit à faible count n'apparaît plus ; layout/survol intacts.
5. **Undo** (étape 4) : après apprentissage, « Annuler l'apprentissage » ne casse pas l'app (décrément réel seulement si les RPC sont déployées).

### 3. Prettier

```bash
npx prettier --write src/lib/facturation/*.ts src/components/facturation/*.tsx
```

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run`, `pnpm build` : tous verts.
- Les 5 scénarios navigateur se comportent comme attendu.
- Aucune régression sur le tamponnage/téléchargement, la détection, ni la galaxie.

## Contrôle /borg

Dernière étape → audit global. Auditer :
- **Prévention effective** : une faute de frappe proche d'un émetteur connu est interceptée avant `learnIssuer` (suggestion), et la case « mémoriser » permet de ne pas apprendre une mauvaise imputation.
- **Aucune écriture DB directe ni DDL exécuté par l'assistant** : seul `facturation_corrections.sql` est livré, à exécuter par l'utilisateur ; les wrappers passent par RPC.
- **Dégradation gracieuse** : RPC de correction absentes → l'app reste utilisable, échecs signalés (pas de `catch {}` muet).
- **Déterminisme / tests** : `similarity`, `normalizeIssuer`, `buildGalaxy(minCount)` couverts par des tests ; aucun test de scoring existant cassé.
- **Séparation métier/vue** : `similarity.ts` reste pur (aucun DOM), `normalizeIssuer` ne dénature pas `normalize` (pas de régression du scoring des nuages).

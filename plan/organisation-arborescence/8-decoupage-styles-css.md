# Étape 8 — Découpage de styles.css

## Objectif

Réduire `src/styles.css` (879 lignes) à ses responsabilités globales (polices, tokens, base, utilitaires transverses) en extrayant les ~685 lignes de styles par feature vers `src/styles/pdj.css` et `src/styles/poster.css` (arbitrage D9, option A), sans aucun changement de rendu écran ni print.

## Fichier(s) impacté(s)

- `src/styles.css` (modification : extraction + `@import` chaînés)
- `src/styles/pdj.css` (nouveau)
- `src/styles/poster.css` (nouveau)

## Travail à réaliser

### 1. Vérification préalable du scoping

Avant toute découpe, vérifier par recherche textuelle que les classes `.pdj-*` ne sont référencées que sous `src/components/pdj/` et `.poster-*` que sous `src/components/affiche/` (hypothèse des commentaires du CSS, non validée à 100 % par l'exploration). Toute exception est traitée avant extraction.

### 2. Extraction

- `src/styles/pdj.css` : bloc `.pdj-*` complet (`styles.css:194-658` environ), y compris le `@media print` A4 portrait.
- `src/styles/poster.css` : bloc `.poster-*` (`:660-879` environ), y compris `@media print` A3 et `@page posterA3`.
- `styles.css` conserve : `@import` des polices et de Tailwind, tokens `:root`/`.dark`, `@theme inline`, `@layer base`, `.empty-canvas`, scrollbars — et ajoute `@import './styles/pdj.css';` et `@import './styles/poster.css';` dans le bloc d'imports en tête de fichier (les `@import` CSS doivent précéder les autres règles).

Contrainte préservée : `components.json` continue de pointer `css: src/styles.css`, qui reste l'unique point d'entrée de la chaîne.

### 3. Nettoyage

Reporter les commentaires de frontière (« rien ne fuit vers les autres pages ») en tête de chaque fichier extrait.

## Ordre d'exécution

1. Vérifier le scoping des préfixes.
2. Créer les deux fichiers, alléger `styles.css`, chaîner les `@import`.
3. Vérifications écran et print.

## Critère de validation

- `pnpm build` sans erreur ; `pnpm dev` rend les pages à l'identique.
- Aperçu print PDJ (A4 portrait) et affiche (A3, `@page posterA3`) inchangés — vérification visuelle obligatoire.
- `styles.css` ne contient plus aucun sélecteur `.pdj-*` ni `.poster-*`.

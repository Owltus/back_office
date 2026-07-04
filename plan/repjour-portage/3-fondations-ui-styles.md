# Étape 3 — Fondations UI : primitives shadcn et styles

## Objectif

Préparer les briques visuelles communes du port : ajouter les primitives shadcn manquantes (`Table`, `Alert`), créer la feuille de styles dédiée `src/styles/repjour.css`, et acter la stratégie de remapping du thème clair de la source vers le dark navy du Back Office.

## Contexte

La source est en thème clair (cartes `bg-white` sur fond gris). Le Back Office est dark navy + shadcn. Le remapping (D15) est une inversion de luminosité, token par token. Deux primitives shadcn manquent : `ui/table.tsx` (absent, alors que `@tanstack/react-table` est en dépendance) et `ui/alert.tsx`. Le `KPITable` (D14) sera porté en `<table>` HTML brut pour préserver sa mécanique responsive ; `ui/table.tsx` sert les tableaux moins subtils (analytique, budget).

## Fichier(s) impacté(s)

- `src/components/ui/table.tsx` (nouveau — shadcn)
- `src/components/ui/alert.tsx` (nouveau — shadcn, si absent)
- `src/styles/repjour.css` (nouveau)
- `src/styles.css` (modification : `@import './styles/repjour.css';` chaîné en tête)

## Travail à réaliser

### 1. Primitives shadcn

Ajouter `ui/table.tsx` et `ui/alert.tsx` via la CLI shadcn (ou copie manuelle conforme aux autres fichiers `ui/`). Ne pas retoucher les autres fichiers `ui/` (vendored).

```bash
pnpm dlx shadcn@latest add table alert
```

### 2. Feuille de styles repjour

Créer `src/styles/repjour.css` avec le préfixe de scoping `.repjour-*`, sur le modèle de `styles/pdj.css` et `styles/poster.css`. Y placer les rares styles qui ne se font pas en classes Tailwind inline : ajustements de densité des tableaux, la règle `.recharts-wrapper *:focus { outline: none }` reportée de la source, et les éventuelles barres de progression multi-segments. Chaîner l'`@import` depuis `src/styles.css` (contrainte `components.json → css: src/styles.css`).

### 3. Table de correspondance du thème (référence pour les étapes suivantes)

Documenter en tête de `repjour.css` (commentaire) le mapping des tokens source → tokens Back Office, pour que les étapes de composants s'y réfèrent :

- `bg-bg` (#F8F9FA) → `bg-background` ; `bg-white` (cartes) → `bg-card` (souvent via `<Card>`)
- `text-text` → `text-foreground` ; `text-secondary` → `text-muted-foreground`
- `border-gray-100/200` → `border-border` ; `bg-gray-50/100` → `bg-muted`
- `primary` navy #1B3A5C (peu contrasté sur navy) → `primary`/`accent` du thème Back Office
- couleurs de graphiques en dur (`#f0f0f0` grille, `#1B3A5C`/`#C0C0C0`/`#E53935` courbes) → adaptées au dark à l'étape 6
- **exception** : l'image email (`email.ts`) garde ses HEX clairs — hors de ce mapping (D10)

## Ordre d'exécution

1. Ajouter `ui/table.tsx` et `ui/alert.tsx`.
2. Créer `styles/repjour.css` + `@import`.
3. Consigner la table de correspondance du thème.

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `pnpm build` passe (chaîne d'`@import` valide).
- `ui/table.tsx` et `ui/alert.tsx` présents et conformes au style des autres primitives.
- `src/styles.css` importe `styles/repjour.css` ; aucune classe `.repjour-*` encore utilisée (normal à ce stade).

# Étape 1 — Corrections de fidélité du PDF

## Objectif

Aligner le rendu imprimé de la page PDJ sur le fork d'origine pour les écarts identifiés par l'audit. Ne toucher qu'à l'impression : le rendu écran (thème sombre, KPI, étoile VIP) reste inchangé.

## Fichier(s) impacté(s)

- `src/components/pdj/BreakfastBoard.tsx`
- `src/styles.css`

## Travail à réaliser

### 1. Titre du PDF : graisse et interlettrage

Le fork imprime le titre en graisse 300 avec `letter-spacing: -0.5px`. Notre bloc `@media print` le met en 600 sans interlettrage.

Dans `src/styles.css`, bloc `@media print`, règle `.pdj-header h1` :

```css
.pdj-header h1 {
  margin: 0;
  font-size: 14px;
  font-weight: 300;          /* était 600 */
  letter-spacing: -0.5px;    /* ajout */
  color: #1a1a1a;
}
```

### 2. Libellé « Chambres occupées »

Le fork affiche « Chambres occupées » ; nous affichons « Chambres ».

Dans `src/components/pdj/BreakfastBoard.tsx`, première carte `<Stat>` :

```tsx
<Stat value={stats.rooms} label="Chambres occupées" icon={BedDouble} accent="#818cf8" />
```

### 3. Flèches ↓/↑ dans les libellés « Recouche » / « Départ » (impression)

Le fork imprime une petite flèche à côté du texte de ces deux libellés du footer. Chez nous, la flèche vit dans l'icône du KPI (`pdj-stat-icon`), masquée en impression, donc absente du PDF.

Solution : réintroduire une flèche dans le libellé, visible uniquement à l'impression (l'écran garde l'icône du KPI, donc pas de doublon).

Dans `BreakfastBoard.tsx` :

- Repasser le type de `label` de `Stat` en `React.ReactNode`.
- Pour les cartes « Recouche » et « Départ », composer le libellé avec une flèche portant la classe `pdj-label-arrow` :

```tsx
<Stat
  value={stats.staying}
  label={<>Recouche<ArrowDown className="pdj-label-arrow" /></>}
  icon={ArrowDown}
  accent="#60a5fa"
/>
<Stat
  value={stats.departing}
  label={<>Départ<ArrowUp className="pdj-label-arrow" /></>}
  icon={ArrowUp}
  accent="#fb7185"
/>
```

Dans `src/styles.css` :

- Section écran : masquer la flèche de libellé (l'écran a déjà l'icône du KPI).

```css
.pdj-label-arrow {
  display: none;
}
```

- Bloc `@media print` : l'afficher, petite, à côté du texte.

```css
.pdj-label-arrow {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 2px;
  vertical-align: middle;
}
```

### 4. Casse des libellés des cases « € »

Aligner le texte source sur le fork (aucun impact visuel car `text-transform: uppercase` en impression, mais respecte « n'invente rien »).

Dans `BreakfastBoard.tsx`, le tableau des libellés revenus :

```tsx
{['PDJ Inclus €', 'PDJ Extra €', 'Total €'].map((label) => (
```

### 5. Colonne Statut — taille de la flèche (selon décision)

Sous-tâche conditionnée par l'arbitrage de l'index (section « Angles à clarifier »).

- Si Option A (conserver 9 px, recommandée) : aucune modification.
- Si Option B (matcher le fork) : dans `src/styles.css`, bloc `@media print`, aligner la cellule et la flèche sur le fork.

```css
.pdj-floor td:nth-child(3) {
  width: 15px;
  padding: 0 2px;
  font-size: 10px;   /* ajout : cellule statut comme le fork */
  text-align: center;
}
.pdj-status-icon {
  width: 16px;       /* était 9px */
  height: 16px;      /* était 9px */
}
```

## Ordre d'exécution

1. Sous-tâche 1 (titre) dans `styles.css`.
2. Sous-tâches 2, 3, 4 dans `BreakfastBoard.tsx` + parties CSS associées à la sous-tâche 3.
3. Sous-tâche 5 selon la décision.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- La page `/pdj` répond (HTTP 200).
- Revue visuelle de l'aperçu d'impression : titre léger, « Chambres occupées », flèches présentes à côté de Recouche/Départ, cases « € » inchangées.

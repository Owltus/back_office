# Étape 2 — Validation et audit final

## Objectif

Vérifier que le PDF corrigé est structurellement identique au fork d'origine, sans régression sur le rendu écran ni sur la logique de données.

## Fichier(s) impacté(s)

- `src/components/pdj/BreakfastBoard.tsx` (relecture, pas de modification attendue)
- `src/styles.css` (relecture, pas de modification attendue)

## Travail à réaliser

### 1. Contrôles automatiques

```bash
npx tsc --noEmit
curl -s -o /dev/null -w "pdj %{http_code}\n" "http://localhost:3000/pdj"
```

### 2. Audit de conformité point par point

Reprendre l'inventaire de référence du fork et cocher chaque élément sur l'aperçu d'impression :

- En-tête : « Breakfast » centré, graisse 300, `letter-spacing -0.5px`, 14px ; date JJ/MM/AAAA en haut-droite, 10px, `#666`.
- Footer, 1re rangée (5 colonnes) : Chambres occupées · Clients · PDJ Inclus · Recouche (avec flèche) · Départ (avec flèche).
- Footer, 2e rangée (3 colonnes) : cases vides PDJ Inclus € · PDJ Extra € · Total €, `min-height 35px`, valeur 24px.
- Grille étages 3×2, `gap 40px 4px`, cartes blanches, barre grise `::before` 2px `#b3b3b3`, sans titre d'étage.
- Tableau : thead masqué ; colonnes Chambre (28px/9.5px/600) · Nom (ellipsis/9px, VIP `#d4a574`) · Statut (flèche : IN HOUSE ↓ `#2196F3`, DUE OUT ↑ `#EF5350`) · Visites (`>1`, 8px) · Clients (cases 16px, « expected » bordure 2px `#333`).
- Lignes : hauteur 9.5px, PDJ inclus fond `#bce6be` sans liseré vert, chambres vides opacité 0.4.
- `@page A4 portrait margin 10mm`, `print-color-adjust: exact`.

### 3. Non-régression écran

- Le thème sombre, les 6 KPI (dont « PDJ non inclus »), les icônes des KPI et l'étoile VIP restent visibles et corrects à l'écran.
- Aucun de ces éléments écran n'apparaît dans l'aperçu d'impression.

## Ordre d'exécution

1. Contrôles automatiques.
2. Audit de conformité de l'aperçu d'impression.
3. Vérification de non-régression écran.

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `/pdj` en 200.
- Tous les points de l'audit de conformité sont satisfaits.
- Aucune régression sur le rendu écran.

## Contrôle /borg

Étape finale du plan : audit global de conformité. Points à auditer :

- Aucun style écran ne fuit dans l'impression (vérifier que `pdj-stat-extra`, `pdj-stat-icon`, `pdj-name-star`, `pdj-count`, box-shadow des lignes incluses sont bien neutralisés en print).
- Les surcharges `@media print` ne cassent pas le rendu écran (grille responsive, remplissage hauteur des cartes, KPI sur une ligne).
- Aucune règle inventée ou libellé divergent restant par rapport au fork.

# Étape 6 — Câblage de la route et audit de conformité

## Objectif

Brancher `AffichageBoard` sur la route `/affichage` existante et valider que le portage reproduit fidèlement la logique et le rendu du fork, sans régression sur les autres pages ni sur l'impression.

## Fichier(s) impacté(s)

- `src/routes/affichage.tsx` (modification : remplacer `<ComingSoon />` par `<AffichageBoard />`)

## Travail à réaliser

### 1. Câblage de la route

Sur le modèle exact de `pdj.tsx` :

```tsx
import { createFileRoute } from '@tanstack/react-router'

import { AffichageBoard } from '#/components/affiche/AffichageBoard.tsx'

export const Route = createFileRoute('/affichage')({ component: AffichagePage })

function AffichagePage() {
  return (
    <div className="flex flex-1 flex-col p-4 md:p-6 print:p-0">
      <AffichageBoard />
    </div>
  )
}
```

Ajouter `print:p-0` au wrapper (comme `pdj.tsx`). La Navbar (`print:hidden`) et le shell `__root` (`print:overflow-visible`) sont déjà en place — rien à modifier.

### 2. Contrôles automatiques

```bash
npx tsc --noEmit
curl -s -o /dev/null -w "affichage %{http_code}\n" "http://localhost:3000/affichage"
```

### 3. Audit de conformité point par point (vs fork)

Reprendre l'inventaire de référence du fork et vérifier chaque élément :

- Démarrage sur le template `coffee_broken`, couleur `okko`, mode auto (jamais vide).
- Les 7 templates remplissent correctement les 4 textes + icône + couleur.
- Mode auto : les tailles se recalculent à la frappe ; `showDates/showHours` forcés à true (espace info toujours réservé).
- Mode manuel : les 4 sliders pilotent les tailles, visibilité conditionnelle des sliders selon le contenu.
- Dates/heures bilingues correctes (FR « Du … au … » / EN « From … to … », formats 24h/12h).
- Logo bicolore : marron/noir en thème signature, couleur du thème sinon.
- Icônes : couleur pilotée par le thème (`currentColor`), taille auto selon longueur de texte.
- Divider + 4 étoiles visibles seulement si contenu EN.
- Impression : A3 portrait sans marge, affiche à taille réelle, couleurs exactes, panneau absent, une seule page.

### 4. Non-régression

- Les autres pages (PDJ, parking, index…) restent inchangées à l'écran et à l'impression.
- Aucun style `.poster-*` ne fuit hors de la page affiche.

## Ordre d'exécution

1. Câblage de la route.
2. Contrôles automatiques.
3. Audit de conformité vs fork.
4. Vérification de non-régression.

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `/affichage` en 200.
- Tous les points de l'audit de conformité sont satisfaits.
- Aucune régression sur les autres pages ni sur l'impression PDJ.

## Contrôle /borg

Étape finale du plan : audit global de conformité. Points à auditer :

- Aucune constante numérique du dimensionnement (`sizeCalculator.ts`) ne diverge du fork.
- Aucun style écran ne fuit en impression et inversement (scope `.poster-*`, `@media screen` vs `@media print`).
- `@page A3 portrait margin 0` et `transform: none !important` bien présents ; affiche à taille réelle.
- Logique métier fidèle : `showEnglish` dérivé, `showDates/showHours` forcés à true, démarrage sur `coffee_broken`, rendu HTML des messages conforme à l'arbitrage retenu.
- Aucune règle ou libellé inventé par rapport au fork.

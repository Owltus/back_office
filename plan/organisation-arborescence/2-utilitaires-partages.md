# Étape 2 — Utilitaires partagés purs

## Objectif

Rapatrier les utilitaires génériques enfouis dans les composants (`clamp`, `range`) vers `lib/utils.ts` (arbitrage D3) et unifier la logique d'impression dupliquée dans `lib/print.ts` sur la variante la plus fiable (arbitrage D4, option A).

## Fichier(s) impacté(s)

- `src/lib/utils.ts` (modification : ajout de `clamp` et `range`)
- `src/lib/print.ts` (nouveau)
- `src/components/parking/ParkingBoard.tsx` (modification : import de `clamp`)
- `src/components/pdj/BreakfastBoard.tsx` (modification : imports de `range` et `printWithTitle`)
- `src/components/affiche/AffichageBoard.tsx` (modification : import de `printWithTitle`)

## Travail à réaliser

### 1. `clamp` et `range` dans `lib/utils.ts`

Déplacer `clamp` (`ParkingBoard.tsx:111-112`) et `range` (`BreakfastBoard.tsx:40-41`) tels quels dans `src/lib/utils.ts`, exports nommés, à côté de `cn()`. Mettre à jour les deux composants pour les importer via `#/lib/utils.ts`.

### 2. `lib/print.ts` — impression avec titre temporaire

Créer `printWithTitle(documentTitle: string): void` sur le modèle de `AffichageBoard.tsx:194-216` (variante retenue : restauration du titre via l'événement `afterprint` avec filet `setTimeout(1000)`), en paramétrant le titre.

```ts
export function printWithTitle(documentTitle: string): void {
  const previous = document.title
  document.title = documentTitle
  const restore = () => {
    document.title = previous
    window.removeEventListener('afterprint', restore)
  }
  window.addEventListener('afterprint', restore)
  window.print()
  setTimeout(restore, 1000)
}
```

Adapter les deux `handlePrint` : `BreakfastBoard.tsx:283-293` (le calcul du nom `Breakfast_JJ-MM-AAAA` reste dans le composant, seul l'appel change — micro-changement assumé : passage de `setTimeout(100)` à `afterprint`) et `AffichageBoard.tsx:194-216` (comportement identique).

## Ordre d'exécution

1. Enrichir `lib/utils.ts`, créer `lib/print.ts`.
2. Mettre à jour les trois boards.
3. Typecheck.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Impression PDJ et affiche : le nom de fichier PDF proposé reste `Breakfast_JJ-MM-AAAA` / `Affiche_JJ-MM-AAAA` et le titre d'onglet revient à « Back Office » après impression.
- Aucune définition locale résiduelle de `clamp`, `range` ni de manipulation directe de `document.title` dans les boards.

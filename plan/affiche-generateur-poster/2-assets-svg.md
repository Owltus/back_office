# Étape 2 — Logo bicolore et collection d'icônes

## Objectif

Porter les SVG inline du fork (logo OKKO Hotels et ~37 icônes) en modules React/TS, en préservant la logique de couleur bicolore du logo et le mécanisme `stroke="currentColor"` des icônes (leur couleur est pilotée par la couleur du thème appliquée en amont).

## Fichier(s) impacté(s)

- `src/lib/poster/icons.ts` (nouveau)
- `src/components/affiche/PosterLogo.tsx` (nouveau)

Sources fork : `assets/js/icons.js`, `assets/js/logo.js`.

## Travail à réaliser

### 1. `icons.ts` — collection d'icônes

Recopier `Icons.collection` : ~37 entrées `{ name, svg }`, SVG inline `viewBox="0 0 24 24"`, `stroke="currentColor"`, `stroke-width` variable (1.2 ou 2 selon l'icône). Inclure l'entrée `none` (croix X, sert de « pas d'icône »).

Exposer une API équivalente au fork :

```ts
export const ICONS: Record<string, { name: string; svg: string }> = { /* … */ }

export function getIconSvg(key: string): string      // fallback 'alert'
export function getIconName(key: string): string     // fallback 'Alerte'
export function getAvailableIcons(): string[]         // Object.keys(ICONS)
```

Le SVG reste une chaîne (comme le fork). Dans le composant Poster (étape 3), il sera injecté via `dangerouslySetInnerHTML` sur un conteneur dont la couleur (`color`/`stroke`) est fixée par le thème — c'est le mécanisme `currentColor`. Contenu SVG statique et interne (pas de saisie utilisateur) : pas de risque XSS.

### 2. `PosterLogo.tsx` — logo bicolore

Porter le SVG OKKO (`viewBox="0 0 3463 1642"`) et sa logique de couleur en composant paramétré :

```tsx
export function PosterLogo({ colorKey, textColor }: { colorKey: ColorKey; textColor: string }) {
  const isSignatureTheme = colorKey === 'okko' || colorKey === 'bw'
  const okkoColor   = isSignatureTheme ? '#604220' : textColor  // bloc "OKKO"
  const hotelsColor = isSignatureTheme ? '#000000' : textColor  // bloc "HOTELS"
  return (/* SVG avec fill={okkoColor} / fill={hotelsColor} sur les bons paths */)
}
```

Règle exacte du fork (`logo.js getSVG`) : pour les thèmes signature (`okko`, `bw`) le bloc « OKKO » est marron `#604220` et « HOTELS » noir `#000000` (couleurs fixes) ; pour les autres thèmes, les deux blocs prennent `color.text` du thème. Le logo est toujours visible.

## Ordre d'exécution

1. `icons.ts` (recopie de la collection + API).
2. `PosterLogo.tsx` (logo + logique bicolore).

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- `getAvailableIcons()` renvoie la liste complète des clés (~37) dont `none`.
- Rendu ponctuel du logo dans les deux cas (thème signature vs thème coloré) : couleurs correctes.

# Étape 1 — Extraire `useMatchMedia` en hook partagé

## Objectif

Sortir le hook `useMatchMedia` (actuellement défini localement, non exporté,
dans `RaproBoard.tsx`) vers un fichier partagé, pour que les deux boards
analytique puissent le réutiliser sans dupliquer sa définition une 2e et 3e fois.

## Contexte

`RaproBoard.tsx` (lignes 107-117) définit :

```tsx
function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return matches
}
```

Ce hook est générique (aucune dépendance à rapro), `false` par défaut au premier
rendu (SSR-safe), recalculé via `matchMedia` + `change` listener. Les étapes 2 à
4 en ont besoin pour `isNavbarMobile` (`max-width: 1023.98px`) et
`showTopToolbar` (`min-width: 640px`).

## Fichier(s) impacté(s)

- `src/components/shared/useMatchMedia.ts` (nouveau)
- `src/components/rapro/RaproBoard.tsx` (modifié : suppression de la définition
  locale, import du hook partagé)

## Travail à réaliser

### 1. Créer le hook partagé

```ts
// src/components/shared/useMatchMedia.ts
import { useEffect, useState } from 'react'

export function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return matches
}
```

### 2. Faire pointer `RaproBoard.tsx` dessus

Supprimer la définition locale (lignes 107-117), ajouter
`import { useMatchMedia } from '#/components/shared/useMatchMedia.ts'` et
vérifier que les deux appels existants (`isNavbarMobile`, `showTopToolbar`)
continuent de fonctionner à l'identique.

## Ordre d'exécution

1. Créer `useMatchMedia.ts`.
2. Modifier `RaproBoard.tsx` (import + suppression du doublon).

## Critère de validation

- `npx tsc --noEmit` : aucune erreur.
- `npx vitest run` : les tests existants passent toujours (aucun test ne cible
  directement ce hook, mais la page `/rapro` ne doit pas régresser).
- Lecture rapide : `RaproBoard.tsx` ne contient plus qu'un import du hook, pas
  de redéfinition.

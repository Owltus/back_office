# Étape 3 — Vue galaxie (Canvas + d3-force + zoom + tooltip)

## Objectif

Le rendu : une nébuleuse où chaque code est un amas de mots, coloré par domaine,
navigable (zoom/pan) avec tooltip au survol. d3 chargé en import() dynamique.

## Contexte

Canvas (D2) pour la fluidité. d3-force place les nœuds (amas par code), d3-zoom gère
la navigation, un `<div>` positionné fait le tooltip. Client-only (la page est
`ssr:false`).

## Fichier(s) impacté(s)

- `src/components/facturation/GalaxyView.tsx` (nouveau)

## Travail à réaliser

### 1. Squelette + chargement paresseux de d3

```tsx
import { useEffect, useRef, useState } from 'react'
import type { GalaxyModel, GalaxyNode } from '#/lib/facturation/galaxy.ts'

export function GalaxyView({ model }: { model: GalaxyModel }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<{ node: GalaxyNode; x: number; y: number } | null>(null)

  useEffect(() => {
    let stop = false
    let cleanup = () => {}
    ;(async () => {
      const [{ forceSimulation, forceX, forceY, forceCollide, forceManyBody }, { zoom, zoomIdentity }, { select }, { scaleSqrt }] =
        await Promise.all([
          import('d3-force'),
          import('d3-zoom'),
          import('d3-selection'),
          import('d3-scale'),
        ])
      if (stop) return
      cleanup = draw(canvasRef.current!, model, setHover, {
        forceSimulation, forceX, forceY, forceCollide, forceManyBody, zoom, zoomIdentity, select, scaleSqrt,
      })
    })()
    return () => { stop = true; cleanup() }
  }, [model])

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
      {hover && <Tooltip node={hover.node} x={hover.x} y={hover.y} />}
    </div>
  )
}
```

### 2. Layout d3-force (amas par code)

- Placer un **centre par code** (répartis sur un cercle, ou une spirale de
  phyllotaxie pour éviter l'alignement) : `center[code] = { x, y }`.
- Simulation sur les nœuds-mots :
  - `forceX(d => center[d.code].x).strength(0.12)` + `forceY(...)` → attraction vers
    l'amas de leur code.
  - `forceCollide(rayon(d) + 1)` → pas de chevauchement.
  - `forceManyBody().strength(-2)` → léger espacement interne.
- Rayon : `scaleSqrt().domain([min,max]).range([1.5, 7])` sur `count`.

### 3. Rendu Canvas « nébuleuse »

- Fond sombre (cohérent avec le thème navy). Pour chaque amas, un halo radial doux
  (gradient de la couleur du domaine, faible alpha) centré sur `center[code]`.
- Chaque nœud : un disque de la couleur du domaine, alpha ~0.85, léger glow.
- Labels de code (code + libellé) près des centres, discrets ; densité de label
  gérée au zoom (afficher les libellés seulement au-delà d'un facteur de zoom).
- Redessin dans le `tick` de la simulation, puis à chaque zoom via la transform.

### 4. Navigation + tooltip

- `select(canvas).call(zoom().scaleExtent([0.3, 8]).on('zoom', e => { transform = e.transform; render() }))`.
- Appliquer `transform` (translate+scale) au contexte avant de dessiner.
- Survol : sur `mousemove`, convertir la position écran → coordonnées monde
  (inverse de la transform), trouver le nœud le plus proche sous le curseur
  (rayon de tolérance) → `setHover({ node, x, y })`. Tooltip = mot + code + libellé
  + count.
- Bouton « recentrer » (reset zoom via `zoomIdentity`).

### 5. Détails

- `devicePixelRatio` pris en compte (netteté).
- `ResizeObserver` pour ajuster la taille du canvas au conteneur.
- Nettoyage : `simulation.stop()`, retrait des listeners dans le cleanup.

## Ordre d'exécution

1. Squelette + import() dynamique de d3.
2. Layout d3-force (centres par code + forces).
3. Rendu Canvas (halos + points + labels).
4. Zoom/pan + tooltip + reset.
5. `npx tsc --noEmit`.

## Critère de validation

- d3 dans un chunk séparé (import dynamique) — pas dans le bundle initial.
- Amas distincts par code, colorés par domaine ; halo « nébuleuse ».
- Zoom/pan fluides ; tooltip correct au survol ; recentrage.
- Aucune fuite (simulation stoppée, listeners retirés au démontage).

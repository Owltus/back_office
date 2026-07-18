# Étape 1 — Dépendances d3 (sous-modules, lazy)

## Objectif

Ajouter les briques d3 nécessaires à la galaxie, en sous-modules ciblés (plus
légers que le monolithe), destinées à un chargement paresseux.

## Fichier(s) impacté(s)

- `package.json`

## Travail à réaliser

```bash
pnpm add d3-force d3-zoom d3-selection d3-scale
pnpm add -D @types/d3-force @types/d3-zoom @types/d3-selection @types/d3-scale
```

- `d3-force` : simulation d'amas (forceSimulation, forceX/forceY, forceCollide, forceManyBody).
- `d3-zoom` : zoom/pan sur le canvas.
- `d3-selection` : requis par d3-zoom pour s'attacher au canvas.
- `d3-scale` : échelle de rayon (scaleSqrt) des points.

Ces modules ne sont importés qu'en **import() dynamique** dans `GalaxyView`
(étape 3) → hors du bundle initial, chargés au premier clic (comme html2canvas).

## Ordre d'exécution

1. `pnpm add …`.
2. `pnpm build` (vérifier que le bundle initial n'embarque pas d3 — il sera dans un
   chunk séparé une fois GalaxyView écrit).

## Critère de validation

- Modules présents dans `package.json`.
- `npx tsc --noEmit` OK (types résolus).

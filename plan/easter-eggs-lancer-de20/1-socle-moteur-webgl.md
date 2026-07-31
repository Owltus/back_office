# Étape 1 — Socle moteur : mode `webgl` + hook `destroy`

## Objectif

Permettre au moteur d'effets d'héberger un effet **WebGL** (pour three.js) en plus
des effets 2D existants, et ajouter un **hook de destruction** au cycle de vie, sans
rien casser des 22 effets 2D actuels.

## Contexte

Aujourd'hui (source `types.ts` + `EffectOverlay.tsx`) : `create(env)` reçoit un
`CanvasRenderingContext2D` déjà obtenu par l'overlay (`getContext('2d')` inconditionnel),
`create` est synchrone, `EffectRunner` n'expose que `frame`, et il n'y a **aucun hook
de destruction**. Un effet ne voit jamais le `<canvas>`. Or three.js a besoin d'un
contexte **WebGL** sur le canvas, et un effet 3D doit libérer ses ressources (sinon
fuite du contexte WebGL, limite ~16).

Décision actée **D1 (option A)** : introduire un **mode `webgl`**. Un canvas ne peut
avoir qu'un type de contexte à vie ; l'overlay doit donc décider `'2d'` vs `'webgl'`
**avant** d'appeler `getContext`, en lisant un discriminant sur la définition.

## Fichier(s) impacté(s)

- `src/lib/artefact/effects/types.ts` (modifié) — discriminant `mode` + variante
  d'env WebGL + `destroy?()`.
- `src/components/shared/EffectOverlay.tsx` (modifié) — branche selon le mode, appelle
  `destroy`.

## Travail à réaliser

### 1. Étendre le contrat (`types.ts`)

Garder la variante 2D comme défaut (les 22 effets ne déclarent pas `mode`), ajouter
une variante WebGL et un `destroy` optionnel.

```ts
/** Surface 2D (inchangée). */
export interface EffectEnv {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
}

/** Surface WebGL : l'effet reçoit le <canvas> brut et crée son propre renderer. */
export interface WebglEffectEnv {
  canvas: HTMLCanvasElement
  width: number
  height: number
  /** Densité de pixels déjà plafonnée par l'overlay (comme pour le 2D). */
  dpr: number
}

export interface EffectRunner {
  frame: (elapsed: number, dt: number) => boolean
  /** Libère les ressources (renderer WebGL, monde physique, listeners). Appelé une
   * fois à l'arrêt / au démontage. Optionnel : les effets 2D n'en ont pas besoin. */
  destroy?: () => void
}

/** Effet 2D historique (mode implicite). */
export interface Canvas2DEffect {
  id: string
  label: string
  hint: string
  durationMs: number
  mode?: '2d'
  create: (env: EffectEnv) => EffectRunner
}

/** Effet WebGL (three.js). */
export interface WebglEffect {
  id: string
  label: string
  hint: string
  durationMs: number
  mode: 'webgl'
  create: (env: WebglEffectEnv) => EffectRunner
}

export type EffectDefinition = Canvas2DEffect | WebglEffect
```

Note : `index.ts` type déjà `EFFECTS: readonly EffectDefinition[]` — l'union reste
compatible. Vérifier les réexports de types en tête d'`index.ts`.

### 2. Brancher l'overlay (`EffectOverlay.tsx`)

Dans le `useEffect`, décider du contexte selon `effect.mode` AVANT tout `getContext`.
Le conteneur (`fixed inset-0 z-[9998] pointer-events-none`) et la boucle rAF restent
communs.

```tsx
const isWebgl = effect.mode === 'webgl'
// ... dimensions + dpr comme aujourd'hui (dpr plafonné à 2)
let runner: EffectRunner
if (isWebgl) {
  // NE PAS appeler getContext('2d'). L'effet prendra 'webgl2' lui-même.
  runner = effect.create({ canvas: canvasEl, width, height, dpr })
} else {
  const context = canvasEl.getContext('2d')
  if (!context) return
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  runner = effect.create({ ctx: context, width, height })
}
```

Pour le mode WebGL, l'overlay fixe `canvas.width/height = width*dpr / height*dpr`
(comme en 2D) mais **ne pose pas** de transform 2D ; c'est le `WebGLRenderer` qui gère
la résolution (`renderer.setPixelRatio(dpr)`, `renderer.setSize(width, height, false)`).

### 3. Appeler `destroy` au bon moment

Router le nettoyage vers `runner.destroy?.()` — une seule fois (le flag `stopped`
existe déjà). Deux points de sortie : l'arrêt naturel (`!alive || cap`) et le cleanup
du `useEffect`.

```tsx
// à l'arrêt naturel (après onDone) et dans le return du useEffect :
if (!destroyed) { destroyed = true; runner.destroy?.() }
```

Attention à l'ordre : `cancelAnimationFrame(raf)` puis `runner.destroy?.()`.

## Ordre d'exécution

1. Modifier `types.ts` (union + `WebglEffectEnv` + `destroy?`).
2. Adapter `EffectOverlay.tsx` (branche `mode`, appel `destroy`).
3. `npx tsc --noEmit` — l'union ne doit rien casser dans les 22 effets ni dans les
   consommateurs (`EffectsPanel`, `EasterEggsBoard`, `SecretEffect`, `EasterEggs`).
4. `pnpm build` — vérifier que rien n'a régressé.

## Critère de validation

- `npx tsc --noEmit` sans erreur (union correctement typée, `verbatimModuleSyntax`
  respecté avec `import type`).
- Les 22 effets 2D existants se déclenchent toujours (test visuel rapide d'au moins 2
  effets 2D via l'onglet « Effets »).
- Aucun changement de comportement pour le mode `2d` (le chemin `getContext('2d')` +
  `setTransform` est strictement équivalent à l'actuel).

## Contrôle /borg

Étape critique (modifie le cœur partagé par les 22 effets). Audit post-exécution :

- **Non-régression 2D** : le chemin `mode !== 'webgl'` reproduit exactement l'ancien
  comportement (même `getContext('2d')`, même `setTransform(dpr…)`, même passage de
  `{ ctx, width, height }`).
- **Cycle de vie** : `destroy` appelé **au plus une fois** par run (flag), après
  `cancelAnimationFrame`, aussi bien à l'arrêt naturel qu'au démontage React
  (changement de `key`/`effect`).
- **Type-safety** : le narrowing de l'union (`effect.mode === 'webgl'`) est correct ;
  aucun effet 2D ne reçoit `WebglEffectEnv` et inversement.
- **Aucun contexte prématuré** : `getContext('2d')` n'est jamais appelé pour un effet
  `webgl` (sinon le canvas est verrouillé en 2D).

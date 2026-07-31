# Étape 2 — Dépendances + squelette de l'effet dé

## Objectif

Ajouter three.js et cannon-es au projet, créer `dice.ts` comme effet **`webgl`** qui
**charge three.js en `import()` dynamique** et rend une scène 3D minimale (plateau +
lumière + un solide témoin), l'enregistrer dans le registre, et **prouver via le build
que three.js sort dans un chunk séparé** (hors du bundle racine).

## Contexte

Le registre `EFFECTS` est atteint statiquement depuis `__root` (via `EasterEggs`).
Tout `import 'three'` statique dans un fichier de ce graphe tomberait dans le bundle
racine. Le patron du projet (CLAUDE.md ; `src/lib/repjour/email.ts:44`) est le
`import()` **dynamique au moment de l'usage** : `const THREE = await import('three')`.
`create` étant synchrone (étape 1 : mode webgl reçoit le canvas), on lance le chargement
dans `create` et `frame` ne fait rien tant que three n'est pas prêt.

## Fichier(s) impacté(s)

- `package.json` (+ lockfile) (modifié) — `three`, `cannon-es`, éventuellement
  `@types/three`.
- `src/lib/artefact/effects/dice.ts` (nouveau) — squelette de l'effet.
- `src/lib/artefact/effects/index.ts` (modifié) — enregistrement.

## Travail à réaliser

### 1. Installer les dépendances

```bash
pnpm add three cannon-es
pnpm add -D @types/three   # si three n'embarque pas ses types dans la version installée
```

Aucune config Vite ni plugin WASM (cannon-es est du JS pur ; la CSP a déjà
`'wasm-unsafe-eval'` mais on n'en a pas besoin ici).

### 2. Squelette de `dice.ts` (effet `webgl`, three en dynamique)

```ts
import type { EffectDefinition, EffectRunner, WebglEffectEnv } from './types.ts'

const DURATION = 6000

function create({ canvas, width, height, dpr }: WebglEffectEnv): EffectRunner {
  // three.js chargé À LA DEMANDE -> chunk séparé, hors bundle racine.
  let ready = false
  let scene, camera, renderer, disposeAll
  let raf0 = 0

  import('three').then((THREE) => {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(dpr)
    renderer.setSize(width, height, false)
    scene = new THREE.Scene()
    camera = /* caméra ortho top-down, étape 3 */
    // lumière + plateau témoin (étape 3)
    disposeAll = () => { /* dispose renderer/geometries/materials, étape 4 */ }
    ready = true
  })

  return {
    frame: (elapsed) => {
      if (ready) renderer.render(scene, camera)
      return elapsed < DURATION
    },
    destroy: () => { disposeAll?.() },
  }
}

export const diceEffect: EffectDefinition = {
  id: 'd20',
  label: 'Lancer de dé 20',
  hint: 'Un D20 tombe et roule jusqu’à un nombre au hasard',
  durationMs: DURATION,
  mode: 'webgl',
  create,
}
```

Note : `DURATION` sera ajusté à l'étape 4 (chargement du chunk + ~2-4 s de lancer +
pause de lecture, sous le cap `durationMs + 4000` de l'overlay). Envisager un
pré-chargement du chunk au survol/à l'ouverture de l'onglet pour masquer la latence
du premier lancer.

### 3. Enregistrer dans `index.ts`

```ts
import { diceEffect } from './dice.ts'
// ... dans EFFECTS (ordre = ordre des boutons)
// ... 'd20' dans VALIDATED_EFFECT_IDS
```

## Ordre d'exécution

1. `pnpm add three cannon-es` (+ `@types/three` si besoin).
2. Créer `dice.ts` (squelette ci-dessus, scène minimale : fond transparent + un cube
   ou icosaèdre témoin + une lumière, juste pour voir « ça rend »).
3. Enregistrer dans `index.ts` (import + `EFFECTS` + `VALIDATED_EFFECT_IDS`).
4. `npx tsc --noEmit`.
5. `pnpm build` puis inspecter `dist/client/assets/` : un chunk `three-*.js` doit
   exister et **ne pas** être référencé par l'entrée HTML (`_shell.html`).

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- `pnpm build` réussit ; **three.js est un chunk séparé**, absent du bundle racine
  (contrôle par inspection de `dist/client/assets/` et de l'entrée).
- Au clic sur « Lancer de dé 20 » (onglet « Effets »), une scène 3D s'affiche
  (solide témoin visible), preuve que le mode `webgl` fonctionne de bout en bout.
- Aucun `import` statique de `three`/`cannon-es` dans un fichier atteignable depuis
  `__root` (grep : `from 'three'` / `from 'cannon-es'` uniquement en dynamique).

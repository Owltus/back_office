# Étape 1 — Runner canvas custom : tiges qui poussent du bas

## Objectif

Écrire `src/lib/artefact/effects/flowers.ts` : un `EffectDefinition` complet dont le
`create` renvoie un runner canvas qui fait pousser une dizaine de tiges depuis le bas
de la fenêtre, déroule des feuilles le long de chaque tige, puis ouvre une fleur
simple (type et couleur variés) au sommet. Le tout typé, sans dépendance nouvelle,
`npx tsc --noEmit` propre.

## Contexte

On calque la structure des effets **custom** du parc (`heart.ts`, `lightning.ts`) et
non le moteur `particleField` (`particles.ts`) : ce dernier translate chaque particule
linéairement et la retire dès qu'elle sort de l'écran, incompatible avec des tiges
enracinées qui grandissent puis restent en place.

Rappels du moteur (source `EffectOverlay.tsx`) :
- `create(env)` reçoit `{ ctx, width, height }`, dimensions en **pixels CSS** (la
  transformation `dpr` est déjà posée par l'overlay — ne jamais re-multiplier).
- Le runner expose `frame(elapsed, dt)` : `elapsed` = ms depuis le déclenchement,
  `dt` = ms depuis l'image précédente (borné à 50). **Retourner `false` démonte
  l'overlay.** Un cap dur existe côté overlay à `durationMs + 4000`.
- L'overlay **n'efface pas** le canvas : l'effet fait son `ctx.clearRect` en tête de
  frame (fond net, comme sakura/heart).
- Origine en haut à gauche, y vers le bas. « Pousser du bas » = base ancrée à
  `y = height`, sommet à `y` décroissant.
- Couleurs **en dur** dans le fichier (pas de tokens de thème) ; verts de tige
  désaturés, cœurs chauds contrastés.

Décisions actées à respecter : **D1** (durée, défaut 12 000 ms) et **D2** (fin douce :
idle sway puis léger flétrissement sur la dernière seconde).

## Fichier(s) impacté(s)

- `src/lib/artefact/effects/flowers.ts` (nouveau)
- Fichiers de référence (lecture) : `src/lib/artefact/effects/heart.ts` (patron
  create custom), `src/lib/artefact/effects/autumn.ts` (feuille en `quadraticCurveTo`,
  palette `COLORS`), `src/lib/artefact/effects/sakura.ts` (échelonnement `bornAt`),
  `src/lib/artefact/effects/types.ts` (contrat).

## Travail à réaliser

### 1. Squelette du runner + horloge par temps absolu

```ts
import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

const DURATION = 12000
const TAU = Math.PI * 2
const COUNT = 14

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3)
const easeOutBack = (x: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

function create({ ctx, width, height }: EffectEnv): EffectRunner {
  const stems = buildStems(width, height) // état figé, voir 2.
  return {
    frame: (elapsed) => {
      ctx.clearRect(0, 0, width, height)
      // dessin de l'arrière vers l'avant (z-order manuel), voir 6.
      for (const s of stems) drawStem(ctx, s, elapsed)
      return elapsed < DURATION
    },
  }
}
```

Toute progression se déduit de `elapsed` (temps **absolu**), jamais d'un cumul de
`dt` : cela évite la dérive et les saccades au retour d'onglet (même règle que
`particles.ts`). `dt` n'est utile qu'aux oscillations, et `elapsed` suffit déjà
(`Math.sin(elapsed * freq)`).

### 2. Modèle de données d'une tige (pré-calculé une fois)

Tout ce qui ne change pas est figé dans `buildStems` — la frame ne recalcule que la
progression et le sway.

```ts
interface Stem {
  x0: number          // pied (ancré en bas)
  height: number      // hauteur finale de la tige
  drift: number       // décalage horizontal du sommet (courbure)
  curve: number       // décalage du point de contrôle à mi-hauteur
  bornAt: number      // délai d'entrée échelonné (ms)
  growMs: number      // durée de pousse de la tige
  swayAmp: number
  swayFreq: number
  swayPhase: number
  depth: number       // pour le tri z-order (fond -> avant)
  leaves: Leaf[]      // positions d'attache sur la Bézier
  flower: Flower      // type, nb pétales, couleurs, géométrie
}
```

Échelonner `bornAt` façon sakura (`(i / COUNT) * spreadMs + jitter`) pour que les
tiges ne poussent pas toutes en bloc. Répartir `x0` sur toute la largeur avec un peu
d'aléa. `depth` sert au tri de dessin (étape 6).

### 3. Croissance de la tige (Bézier quadratique tracée partiellement)

La tige est une Bézier quadratique `B(u)` : base ancrée, sommet en haut, point de
contrôle décalé pour une courbure douce. On l'affiche « poussée jusqu'à `p` » en
échantillonnant de `u = 0` à `u = p`.

```ts
// B(u) = (1-u)^2 P0 + 2(1-u)u P1 + u^2 P2
const p = easeOutCubic(clamp01((elapsed - s.bornAt) / s.growMs))
// sway pondéré base(0) -> pointe(1) ajouté à P1 et P2, jamais à P0 :
const sway = s.swayAmp * Math.sin(elapsed * s.swayFreq + s.swayPhase)
// tracer moveTo(P0) puis lineTo(B(u)) pour u de 0 à p par pas ~0.04
```

`lineWidth` décroissant de la base vers la pointe pour un rendu organique (unités CSS,
pas de multiplication par `dpr`). Le pied `P0` ne bouge jamais (base stable).

### 4. Feuilles (amande + apparition au passage de la pousse)

Feuille = deux `quadraticCurveTo` symétriques (comme `autumn.ts`), placée à un
paramètre d'attache `sParam ∈ [0.2, 0.8]` sur la Bézier, orientée selon la tangente
`B'(u) = 2(1-u)(P1-P0) + 2u(P2-P1)`, alternée gauche/droite.

```ts
const leafP = clamp01((p - leaf.sParam) / 0.15) // sort quand la pousse la dépasse
const scale = easeOutBack(leafP)                // petit rebond à l'ouverture
// ctx.translate(B(sParam)); ctx.rotate(angle(tangente) + coteAlterne); ctx.scale(scale, scale)
```

Une feuille n'apparaît que lorsque la tige a dépassé son point d'attache : les
feuilles « déroulent » au fur et à mesure de la montée.

### 5. Fleurs (pétales par rotation + éclosion) et variété

La fleur s'ouvre au sommet (`P2`) quand la tige est presque finie. Pétales répartis
par rotation (`i * TAU / N`) avec `save/rotate/restore`, cœur chaud par-dessus.

```ts
const bloom = easeOutBack(clamp01((tRaw - bloomStart) / bloomDur))
// pour i de 0..N-1 : save(); translate(P2); rotate(i*TAU/N); scale(bloom); dessinePetale(); restore()
// puis dessineCoeur(P2)
```

Types procéduraux tirés au sort (D4), pétale en ellipse orientée ou amande :

| Type | N pétales | Pétale | Particularité |
|------|-----------|--------|---------------|
| Marguerite | 10–16 | fin et long | gros cœur contrasté |
| Fleur ronde | 5–6 | large arrondi | petit cœur |
| Tulipe | 3–4 | cupule serrée vers le haut | pas réparti sur 360° |
| Lavande / bleuet | 5–6 | petit | tons violets/bleus |

Palettes printanières (tige / pétales clair→saturé / cœur) — verts désaturés, cœurs
chauds : rose `#5BA84F` / `#FF9EC4`→`#FF6FA5` / `#FFD54F` ; marguerite `#8BC34A` /
`#FFFFFF`→`#F5F5F5` / `#F9A825` ; lavande `#6FA86B` / `#C8A2E0`→`#B388D9` / `#FFE082` ;
tulipe corail `#66A15E` / `#FFB59E`→`#FF7043` / `#FFB74D` ; bleuet `#5E9E58` /
`#9DBEF0`→`#5B8DD9` / `#FFE082`. Éviter `shadowBlur` (coûteux) ; un léger dégradé
radial cœur→bord, créé une seule fois, suffit à donner du volume.

### 6. Orchestration temporelle + z-order + fin douce (D2)

Phases **chevauchées** (pas séquentielles), en fraction de la vie de chaque tige :
pousse tige 0→40 %, feuilles 15→55 %, cœur 40→70 %, pétales 45→100 %. `easeOutBack`
sur l'éclosion pour le petit dépassement.

- **z-order** : dessiner de l'arrière vers l'avant — trier `stems` par `depth`, et
  pour chaque plant tige → feuilles → fleur.
- **Fin douce (D2, option A)** : une fois `bloom` à 1, entretenir un idle sway léger ;
  sur la dernière ~1 000 ms (`elapsed > DURATION - 1000`), appliquer un discret
  facteur de flétrissement (légère inclinaison + baisse d'opacité globale) pour un
  départ moins abrupt qu'une coupe sèche. `frame` renvoie `false` à `DURATION`.

### 7. Export de l'`EffectDefinition`

```ts
export const flowersEffect: EffectDefinition = {
  id: 'flowers',
  label: 'Fleurs de printemps',
  hint: 'Des tiges fleurissent depuis le bas',
  durationMs: DURATION,
  create,
}
```

Conventions : named export, imports relatifs avec extension (`./types.ts`), single
quotes, pas de point-virgule, `import type` séparé, commentaire d'en-tête en français
décrivant l'intention (comme les effets frères).

## Ordre d'exécution

1. Créer `flowers.ts` avec le squelette (1) et l'export (7) — `tsc` doit déjà passer.
2. Implémenter `buildStems` (2), puis la pousse de tige (3).
3. Ajouter feuilles (4), puis fleurs et variété (5).
4. Câbler l'orchestration, le z-order et la fin douce (6).
5. `npx tsc --noEmit` après chaque bloc.

## Critère de validation

- `npx tsc --noEmit` sans erreur (respect strict du contrat `EffectDefinition` /
  `EffectRunner`).
- Aucune dépendance nouvelle ; aucun import de `particles.ts`.
- Toute progression dérive de `elapsed` (aucun cumul de `dt`) ; `frame` renvoie
  `false` à `DURATION`.
- Couleurs en dur dans le fichier, `clearRect` en tête de frame, dessin en pixels CSS
  (pas de `* dpr`), pas de `shadowBlur` par frame.
- Le fichier suit les conventions (named export, extensions, quotes, en-tête FR).

import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Fleurs de printemps — depuis le bas de la fenêtre, un lit d'herbe et une rangée de
 * tiges POUSSENT (tracé partiel d'une Bézier quadratique), déroulent des feuilles en
 * amande, puis s'ouvrent en fleurs simples de types et couleurs variés (marguerite,
 * fleur ronde, tulipe). Effet « nature » calé sur sakura / autumn (durée 12 s).
 *
 * Contrairement aux effets de chute (sakura, autumn, bâtis sur `particleField`), une
 * tige est ENRACINÉE : elle grandit puis reste. On utilise donc un `create` custom
 * (patron heart.ts) — état figé à la création, `clearRect` par image, rendu à la
 * hauteur courante. Toute progression se déduit du temps ABSOLU `elapsed` (aucun
 * cumul de `dt`, donc pas de dérive au retour d'onglet).
 *
 * VENT : une seule fonction `windAt(elapsed)` (somme de sinus = brise + rafales)
 * pilote tout le décor — herbe et tiges plient ENSEMBLE, d'autant plus que le point
 * est haut (base immobile, sommet mobile), avec un petit flottement propre à chaque
 * plante pour éviter l'effet « bloc rigide ». C'est la physique « simple » demandée.
 *
 * Une tige ne pouvant pas « sortir de l'écran », la fin est douce : fondu + léger
 * flétrissement sur la dernière seconde, puis l'overlay se démonte à `DURATION`.
 */

const DURATION = 12000
const TAU = Math.PI * 2
const COUNT = 14
const BLADES = 350
/** Fondu / flétrissement final (ms avant DURATION). */
const FADE_MS = 1200
/** Échelle globale du décor : ~2x plus bas, PROPORTIONS conservées (tout est
 * multiplié pareil -> rien n'est déformé, juste plus petit). */
const SCENE_SCALE = 0.55

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3)
const easeOutBack = (x: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

/** Vent global (brise lente + deux rafales) — renvoie ~[-1, 1]. Partagé par toute
 * la scène : l'herbe et les fleurs se couchent dans le même sens au même moment. */
const windAt = (t: number) =>
  Math.sin(t * 0.0007) * 0.6 +
  Math.sin(t * 0.0017 + 1.3) * 0.3 +
  Math.sin(t * 0.0031 + 0.5) * 0.1

/** Palettes printanières : tige (vert désaturé), pétale (saturé), cœur (chaud). */
interface Palette {
  stem: string
  petal: string
  core: string
}
const PALETTES: readonly Palette[] = [
  { stem: '#5ba84f', petal: '#ff6fa5', core: '#ffd54f' },
  { stem: '#8bc34a', petal: '#f7f7f7', core: '#f9a825' },
  { stem: '#7cb342', petal: '#ffee58', core: '#6d4c41' },
  { stem: '#6fa86b', petal: '#b388d9', core: '#ffe082' },
  { stem: '#66a15e', petal: '#ff7043', core: '#ffb74d' },
  { stem: '#5e9e58', petal: '#5b8dd9', core: '#ffe082' },
]

/** Verts de l'herbe (index tiré au spawn). */
const GRASS: readonly string[] = [
  '#3f7a3a',
  '#4a8f43',
  '#57a24d',
  '#68b85e',
  '#7cc169',
]

type FlowerType = 'daisy' | 'round' | 'tulip'

interface Leaf {
  /** Position d'attache sur la tige (paramètre Bézier). */
  at: number
  /** Côté (gauche / droite). */
  side: 1 | -1
  len: number
}

interface Flower {
  type: FlowerType
  petals: number
  petalLen: number
  petalWid: number
  coreR: number
  /** Rotation de base du bouquet de pétales. */
  rot: number
}

interface Stem {
  // Points de contrôle de la Bézier (base ancrée en bas, sommet en haut).
  p0x: number
  p0y: number
  p1x: number
  p1y: number
  p2x: number
  p2y: number
  /** Marge de bord = rayon de la fleur : borne le sommet à l'écran (vent compris). */
  edge: number
  bornAt: number
  growMs: number
  bloomStart: number
  bloomDur: number
  swayAmp: number
  swayFreq: number
  swayPhase: number
  breathPhase: number
  depth: number
  scale: number
  alpha: number
  width: number
  pal: Palette
  leaves: Leaf[]
  flower: Flower
}

interface Blade {
  x0: number
  h: number
  /** Courbure de repos (léger arc naturel). */
  lean: number
  bornAt: number
  growMs: number
  swayAmp: number
  swayFreq: number
  swayPhase: number
  /** Demi-largeur à la base (brin fin, effilé vers la pointe). */
  w: number
  color: string
  depth: number
}

const bezX = (a: number, b: number, c: number, u: number) => {
  const mu = 1 - u
  return mu * mu * a + 2 * mu * u * b + u * u * c
}
const tanX = (a: number, b: number, c: number, u: number) => {
  const mu = 1 - u
  return 2 * mu * (b - a) + 2 * u * (c - b)
}

function buildFlower(size: number): Flower {
  const r = Math.random()
  const type: FlowerType = r < 0.4 ? 'daisy' : r < 0.72 ? 'round' : 'tulip'
  if (type === 'daisy')
    return {
      type,
      petals: 12 + Math.floor(Math.random() * 5),
      petalLen: size * 1.15,
      petalWid: size * 0.26,
      coreR: size * 0.42,
      rot: Math.random() * TAU,
    }
  if (type === 'round')
    return {
      type,
      petals: 5 + Math.floor(Math.random() * 2),
      petalLen: size * 0.92,
      petalWid: size * 0.62,
      coreR: size * 0.34,
      rot: Math.random() * TAU,
    }
  return {
    type,
    petals: 4,
    petalLen: size * 1.25,
    petalWid: size * 0.52,
    coreR: 0,
    rot: 0,
  }
}

function buildStems(width: number, height: number, groundY: number): Stem[] {
  const stems: Stem[] = []
  for (let i = 0; i < COUNT; i++) {
    const depth = Math.random()
    // Peu de variance -> lit de fleurs HOMOGÈNE (tailles et hauteurs proches).
    // SCENE_SCALE réduit tout le plant en gardant ses proportions internes.
    const scale = (0.88 + depth * 0.24) * SCENE_SCALE
    // Tiges assez hautes pour une bonne PROPORTION fleur/tige, mais tout le décor
    // reste petit et dans le bas de la fenêtre (~1/3 plus petit qu'avant).
    const h = height * (0.093 + Math.random() * 0.034) * scale
    // Base répartie sur la largeur avec un peu d'aléa.
    const x0 = ((i + 0.5) / COUNT) * width + (Math.random() - 0.5) * (width / COUNT)
    // Tiges presque droites -> rangée bien alignée.
    const drift = (Math.random() - 0.5) * h * 0.18
    const curve = (Math.random() - 0.5) * h * 0.28
    // Fleurs, plage resserrée (homogène).
    const size = (14 + Math.random() * 3.5) * scale
    const edge = size * 1.7 + 10
    const clampX = (x: number) => Math.max(edge, Math.min(width - edge, x))

    const leafCount = 1 + Math.floor(Math.random() * 2)
    const leaves: Leaf[] = []
    for (let l = 0; l < leafCount; l++)
      leaves.push({
        at: 0.3 + Math.random() * 0.35,
        side: Math.random() < 0.5 ? 1 : -1,
        len: (11 + Math.random() * 3.5) * scale,
      })

    const growMs = 2800 + Math.random() * 900
    stems.push({
      p0x: x0,
      p0y: groundY,
      p1x: clampX(x0 + curve),
      p1y: groundY - h * 0.5,
      p2x: clampX(x0 + drift),
      p2y: groundY - h,
      edge,
      bornAt: (i / COUNT) * 1500 + Math.random() * 260,
      growMs,
      bloomStart: growMs * 0.68,
      bloomDur: 1500 + Math.random() * 500,
      swayAmp: 2 + Math.random() * 3,
      swayFreq: 0.0011 + Math.random() * 0.0009,
      swayPhase: Math.random() * TAU,
      breathPhase: Math.random() * TAU,
      depth,
      scale,
      alpha: 0.8 + depth * 0.2,
      width: 1.6 + size * 0.05,
      pal: PALETTES[Math.floor(Math.random() * PALETTES.length)],
      leaves,
      flower: buildFlower(size),
    })
  }
  // Arrière vers l'avant : les tiges du fond (petit depth) dessinées d'abord.
  stems.sort((a, b) => a.depth - b.depth)
  return stems
}

function buildBlades(width: number, height: number): Blade[] {
  const blades: Blade[] = []
  for (let i = 0; i < BLADES; i++) {
    const depth = Math.random()
    const scale = (0.7 + depth * 0.5) * SCENE_SCALE
    blades.push({
      x0: Math.random() * width,
      // Brins plus courts que les tiges (les fleurs dominent le lit d'herbe).
      h: height * (0.033 + Math.random() * 0.053) * scale,
      lean: (Math.random() - 0.5) * height * 0.014 * SCENE_SCALE,
      bornAt: Math.random() * 900,
      growMs: 1200 + Math.random() * 1200,
      swayAmp: 3 + Math.random() * 5,
      swayFreq: 0.0012 + Math.random() * 0.001,
      swayPhase: Math.random() * TAU,
      w: (1.2 + Math.random() * 1.4) * SCENE_SCALE,
      color: GRASS[Math.floor(Math.random() * GRASS.length)],
      depth,
    })
  }
  blades.sort((a, b) => a.depth - b.depth)
  return blades
}

function drawPetals(ctx: CanvasRenderingContext2D, f: Flower, pal: Palette) {
  if (f.type === 'tulip') {
    // Tulipe : pétales cambrés serrés vers le haut, pas répartis sur 360°.
    const angles = [-0.5, -0.17, 0.17, 0.5]
    ctx.fillStyle = pal.petal
    for (const a of angles) {
      ctx.save()
      ctx.rotate(a)
      ctx.beginPath()
      ctx.ellipse(0, -f.petalLen * 0.5, f.petalWid * 0.5, f.petalLen * 0.5, 0, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
    return
  }
  // Marguerite / fleur ronde : pétales répartis par rotation autour du cœur.
  ctx.fillStyle = pal.petal
  for (let i = 0; i < f.petals; i++) {
    ctx.save()
    ctx.rotate(f.rot + (i / f.petals) * TAU)
    ctx.beginPath()
    ctx.ellipse(
      0,
      -(f.coreR + f.petalLen * 0.5),
      f.petalWid * 0.5,
      f.petalLen * 0.5,
      0,
      0,
      TAU,
    )
    ctx.fill()
    ctx.restore()
  }
}

function create({ ctx, width, height }: EffectEnv): EffectRunner {
  const groundY = height + 4
  const blades = buildBlades(width, height)
  const stems = buildStems(width, height, groundY)

  return {
    frame(elapsed) {
      ctx.clearRect(0, 0, width, height)
      const endFade = clamp01((DURATION - elapsed) / FADE_MS)
      const wilt = 1 - endFade // 0 en régime, 1 en toute fin
      const wind = windAt(elapsed)

      // 1) Herbe, derrière les fleurs. Brins effilés qui poussent puis ondulent.
      for (const b of blades) {
        const localMs = elapsed - b.bornAt
        if (localMs <= 0) continue
        const grow = easeOutCubic(clamp01(localMs / b.growMs))
        const hEff = b.h * grow
        const flutter = Math.sin(elapsed * b.swayFreq + b.swayPhase) * b.swayAmp
        // Vent pondéré par la hauteur : le brin plie surtout vers la pointe.
        const bend = wind * hEff * 0.5 + flutter + b.lean
        const tx = b.x0 + bend
        const ty = groundY - hEff
        const mx = b.x0 + bend * 0.4 + b.lean * 0.5
        const my = groundY - hEff * 0.5
        ctx.globalAlpha = (0.5 + b.depth * 0.4) * endFade
        ctx.fillStyle = b.color
        ctx.beginPath()
        ctx.moveTo(b.x0 - b.w, groundY)
        ctx.quadraticCurveTo(mx - b.w * 0.4, my, tx, ty)
        ctx.quadraticCurveTo(mx + b.w * 0.4, my, b.x0 + b.w, groundY)
        ctx.closePath()
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // 2) Fleurs, devant l'herbe.
      for (const s of stems) {
        const localMs = elapsed - s.bornAt
        if (localMs <= 0) continue
        const grow = easeOutCubic(clamp01(localMs / s.growMs))

        // Vent global (dominant) + petit flottement propre, pondérés par la hauteur ;
        // base P0 immobile. La fin ajoute un léger affaissement du sommet.
        const h = s.p0y - s.p2y
        const flutter = Math.sin(elapsed * s.swayFreq + s.swayPhase) * s.swayAmp
        const bendTip = wind * h * 0.28 + flutter
        // Clamp au bord (vent compris) : la fleur ne sort jamais de l'écran.
        const p1x = Math.max(
          s.edge,
          Math.min(width - s.edge, s.p1x + bendTip * 0.45),
        )
        const p2x = Math.max(s.edge, Math.min(width - s.edge, s.p2x + bendTip))
        const p2y = s.p2y + wilt * h * 0.12

        ctx.save()
        ctx.globalAlpha = s.alpha * endFade

        // Tige : tracé partiel de la Bézier de u = 0 à u = grow.
        ctx.strokeStyle = s.pal.stem
        ctx.lineWidth = s.width
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(s.p0x, s.p0y)
        const steps = Math.max(2, Math.ceil(grow / 0.04))
        for (let k = 1; k <= steps; k++) {
          const u = (grow * k) / steps
          ctx.lineTo(bezX(s.p0x, p1x, p2x, u), bezX(s.p0y, s.p1y, p2y, u))
        }
        ctx.stroke()

        // Feuilles : sortent quand la pousse dépasse leur point d'attache.
        for (const leaf of s.leaves) {
          if (grow < leaf.at) continue
          const lp = easeOutBack(clamp01((grow - leaf.at) / 0.16))
          if (lp <= 0) continue
          const lx = bezX(s.p0x, p1x, p2x, leaf.at)
          const ly = bezX(s.p0y, s.p1y, p2y, leaf.at)
          const ang = Math.atan2(
            tanX(s.p0y, s.p1y, p2y, leaf.at),
            tanX(s.p0x, p1x, p2x, leaf.at),
          )
          ctx.save()
          ctx.translate(lx, ly)
          // ang = tangente de la tige (vers le haut). +π/2 aligne l'épine de la
          // feuille sur la pousse, ±0.6 l'écarte de part et d'autre : les deux
          // feuilles sortent vers le haut-extérieur (jamais vers le sol).
          ctx.rotate(ang + Math.PI / 2 + leaf.side * 0.6)
          ctx.scale(lp, lp)
          ctx.fillStyle = s.pal.stem
          const w = leaf.len * 0.5
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.quadraticCurveTo(w, -leaf.len * 0.5, 0, -leaf.len)
          ctx.quadraticCurveTo(-w, -leaf.len * 0.5, 0, 0)
          ctx.closePath()
          ctx.fill()
          ctx.restore()
        }

        // Fleur : éclosion au sommet quand la tige est presque finie ; elle penche
        // avec le vent (petit couple visuel).
        const bloom = easeOutBack(clamp01((localMs - s.bloomStart) / s.bloomDur))
        if (bloom > 0.001) {
          const tipU = Math.min(grow, 1)
          const fx = bezX(s.p0x, p1x, p2x, tipU)
          const fy = bezX(s.p0y, s.p1y, p2y, tipU)
          const breath = 1 + 0.03 * Math.sin(elapsed * 0.004 + s.breathPhase)
          const sc = bloom * breath
          ctx.save()
          ctx.translate(fx, fy)
          ctx.rotate(wind * 0.13)
          ctx.scale(sc, sc)
          drawPetals(ctx, s.flower, s.pal)
          if (s.flower.coreR > 0) {
            ctx.fillStyle = s.pal.core
            ctx.beginPath()
            ctx.arc(0, 0, s.flower.coreR, 0, TAU)
            ctx.fill()
          }
          ctx.restore()
        }

        ctx.restore()
      }

      return elapsed < DURATION
    },
  }
}

export const flowersEffect: EffectDefinition = {
  id: 'flowers',
  label: 'Fleurs de printemps',
  hint: 'Des fleurs poussent dans l’herbe au vent',
  durationMs: DURATION,
  create,
}

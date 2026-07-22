import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Pluie de billets — une trentaine de billets de dollars tombent DOUCEMENT du
 * haut, en se balançant et en se retournant (effet « feuille morte »), jusqu'à
 * SORTIR de l'écran par le bas (ils ne s'évanouissent pas en plein vol). Non
 * bloquant : l'overlay est en `pointer-events: none`, l'interface reste
 * utilisable pendant l'effet.
 *
 * Chaque billet est recalculé à partir du temps ABSOLU (`elapsed`) : positions
 * robustes, aucune dérive. Le retournement est simulé par la largeur apparente
 * (le billet s'affine puis se rouvre). L'effet s'arrête dès que TOUS les billets
 * sont sortis de l'écran (borné par `durationMs`). Fond effacé net à chaque image.
 */

/** Cap dur : temps max pour que le dernier billet (lent, tardif) sorte. */
const DURATION = 6000
const TAU = Math.PI * 2
/** Nombre de billets. */
const COUNT = 28
/** Fenêtre d'apparition échelonnée (ms) : la pluie s'installe progressivement. */
const SPAWN_MS = 800
/** Marge sous le bas de l'écran : un billet au-delà est considéré sorti. */
const EXIT_MARGIN = 48

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

interface Bill {
  x: number
  y0: number
  vy: number
  sway: number
  swayFreq: number
  phase: number
  spin: number
  spin0: number
  tilt: number
  tilt0: number
  w: number
  bornAt: number
  hue: number
}

function create({ ctx, width, height }: EffectEnv): EffectRunner {
  const bills: Bill[] = []
  for (let i = 0; i < COUNT; i++) {
    bills.push({
      x: width * (0.06 + Math.random() * 0.88),
      y0: -40 - Math.random() * 120,
      vy: 0.26 + Math.random() * 0.18,
      sway: 14 + Math.random() * 26,
      swayFreq: 0.0011 + Math.random() * 0.0016,
      phase: Math.random() * TAU,
      spin: (0.0016 + Math.random() * 0.0028) * (Math.random() < 0.5 ? -1 : 1),
      spin0: Math.random() * TAU,
      tilt: (Math.random() - 0.5) * 0.0016,
      tilt0: (Math.random() - 0.5) * 0.5,
      w: 38 + Math.random() * 18,
      bornAt: (i / COUNT) * SPAWN_MS + Math.random() * 140,
      hue: 128 + Math.random() * 26,
    })
  }

  // Dessine le billet ; renvoie `false` s'il est déjà sorti de l'écran.
  const drawBill = (b: Bill, elapsed: number): boolean => {
    const age = elapsed - b.bornAt
    const cy = b.y0 + b.vy * age
    if (cy > height + EXIT_MARGIN) return false

    const alpha = clamp01(age / 220) // fondu d'apparition seulement
    if (alpha <= 0.02) return true

    const cx = b.x + Math.sin(elapsed * b.swayFreq + b.phase) * b.sway
    const tilt = b.tilt0 + b.tilt * age
    const flip = Math.cos(b.spin0 + b.spin * age)
    const w = b.w * Math.max(0.14, Math.abs(flip))
    const h = b.w * 0.44
    const back = flip < 0

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(tilt)
    ctx.globalAlpha = alpha

    // Corps du billet — un ton plus sombre côté pile.
    ctx.fillStyle = `hsl(${b.hue}, ${back ? 30 : 42}%, ${back ? 33 : 41}%)`
    ctx.fillRect(-w / 2, -h / 2, w, h)
    // Cadre intérieur.
    ctx.strokeStyle = `hsla(${b.hue}, 45%, 82%, 0.4)`
    ctx.lineWidth = 1
    ctx.strokeRect(-w / 2 + 2.5, -h / 2 + 2.5, w - 5, h - 5)
    // « $ » sur la FACE uniquement (flip > 0), comprimé horizontalement du même
    // facteur que le billet : le symbole se retourne AVEC lui — il s'affine puis
    // se cache au passage sur la tranche/le dos, au lieu de clignoter d'un seuil.
    if (flip > 0.06) {
      ctx.scale(flip, 1)
      ctx.fillStyle = `hsla(${b.hue}, 50%, 88%, 0.9)`
      ctx.font = `bold ${Math.round(h * 0.62)}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('$', 0, 0.5)
    }
    ctx.restore()
    return true
  }

  return {
    frame(elapsed) {
      ctx.clearRect(0, 0, width, height)
      let anyAlive = false
      for (const b of bills) {
        if (elapsed < b.bornAt) {
          anyAlive = true // pas encore apparu
          continue
        }
        if (drawBill(b, elapsed)) anyAlive = true
      }
      // On tourne tant qu'un billet est encore à venir ou à l'écran.
      return anyAlive && elapsed < DURATION
    },
  }
}

export const moneyRainEffect: EffectDefinition = {
  id: 'moneyrain',
  label: 'Pluie de billets',
  hint: 'Des dollars tombent doucement et sortent de l’écran',
  durationMs: DURATION,
  create,
}

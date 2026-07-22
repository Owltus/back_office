import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Étoiles filantes — deux météores traversent l'écran en diagonale, l'un après
 * l'autre. Chacun : une tête incandescente à halo, une traînée EFFILÉE en dégradé
 * (halo froid large + cœur blanc fin, taillée en pointe vers l'arrière) et une
 * pluie d'étincelles qui se détachent du sillage, scintillent et retombent.
 *
 * Le fond est effacé net à chaque image : la traînée est PEINTE (un triangle
 * dégradé), pas laissée en rémanence — elle reste ainsi nette et de longueur
 * constante d'un bout à l'autre du parcours. Tout est composé en `lighter`
 * (additif), pour que les lumières se cumulent comme une vraie source.
 *
 * Départs décalés dans le TEMPS et perpendiculairement (les deux ne se
 * superposent pas), teintes légèrement différentes : la paire se lit comme deux
 * passages distincts, pas comme un doublon. Version « ciel nocturne » du même
 * esprit festif que le feu d'artifice ; c'est aussi l'easter egg clavier « claudia ».
 */

const DURATION = 3400
const TAU = Math.PI * 2
/** Angle de descente sous l'horizontale (~31°) : assez incliné pour lire
 * « diagonale », assez plat pour balayer toute la largeur. */
const ANGLE = Math.PI * 0.172
/** Une étincelle émise le long du sillage toutes les ~28 ms. */
const EMIT_MS = 28
/** Gravité douce sur les étincelles (px/ms²) : elles retombent sans se ruer. */
const SPARK_GRAV = 0.00006

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  born: number
  life: number
  size: number
  phase: number
}

interface Star {
  startAt: number
  travelMs: number
  x0: number
  y0: number
  x1: number
  y1: number
  /** Teinte du halo (le cœur reste blanc). */
  halo: readonly [number, number, number]
  sparks: Spark[]
  emitAt: number
}

function create({ ctx, width, height }: EffectEnv): EffectRunner {
  const diag = Math.hypot(width, height)
  const dirX = Math.cos(ANGLE)
  const dirY = Math.sin(ANGLE)
  // Perpendiculaire unitaire : taille la traînée et décale les deux passages.
  const perpX = -dirY
  const perpY = dirX
  // Trajet plus long que l'écran, centré : entrée et sortie hors champ.
  const span = diag * 1.4
  const tail = diag * 0.2

  const makeStar = (
    startAt: number,
    travelMs: number,
    offset: number,
    halo: readonly [number, number, number],
  ): Star => {
    const mx = width * 0.5 + perpX * offset
    const my = height * 0.5 + perpY * offset
    return {
      startAt,
      travelMs,
      halo,
      x0: mx - dirX * span * 0.5,
      y0: my - dirY * span * 0.5,
      x1: mx + dirX * span * 0.5,
      y1: my + dirY * span * 0.5,
      sparks: [],
      emitAt: -1,
    }
  }

  const stars: Star[] = [
    makeStar(0, 1300, -height * 0.19, [150, 196, 255]),
    makeStar(1100, 1380, height * 0.13, [188, 236, 246]),
  ]

  // Triangle tête (large) → queue (pointe), rempli en dégradé tête-opaque →
  // queue-transparente. `w` = demi-largeur à la tête.
  const drawTrail = (
    hx: number,
    hy: number,
    w: number,
    head: string,
    tailColor: string,
  ) => {
    const tx = hx - dirX * tail
    const ty = hy - dirY * tail
    const grad = ctx.createLinearGradient(hx, hy, tx, ty)
    grad.addColorStop(0, head)
    grad.addColorStop(1, tailColor)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(hx + perpX * w, hy + perpY * w)
    ctx.lineTo(hx - perpX * w, hy - perpY * w)
    ctx.lineTo(tx, ty)
    ctx.closePath()
    ctx.fill()
  }

  return {
    frame(elapsed, dt) {
      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'
      const globalFade = clamp01((DURATION - elapsed) / 500)

      for (const star of stars) {
        const [hr, hg, hb] = star.halo
        const life = (elapsed - star.startAt) / star.travelMs

        if (life >= 0 && life <= 1) {
          const hx = star.x0 + (star.x1 - star.x0) * life
          const hy = star.y0 + (star.y1 - star.y0) * life
          // Fondu aux deux extrémités du trajet (12 %) : entrée/sortie douce.
          const edge = clamp01(Math.min(life, 1 - life) / 0.12)
          const k = edge * globalFade

          // Traînée : halo froid large, puis cœur blanc fin par-dessus.
          drawTrail(
            hx,
            hy,
            9,
            `rgba(${hr}, ${hg}, ${hb}, ${(0.34 * k).toFixed(3)})`,
            `rgba(${hr}, ${hg}, ${hb}, 0)`,
          )
          drawTrail(
            hx,
            hy,
            2.4,
            `rgba(255, 255, 255, ${(0.92 * k).toFixed(3)})`,
            `rgba(${hr}, ${hg}, ${hb}, 0)`,
          )

          // Tête : halo radial (cœur blanc → teinte → transparent).
          const headR = 24
          const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, headR)
          glow.addColorStop(0, `rgba(255, 255, 255, ${(0.95 * k).toFixed(3)})`)
          glow.addColorStop(
            0.35,
            `rgba(${hr}, ${hg}, ${hb}, ${(0.5 * k).toFixed(3)})`,
          )
          glow.addColorStop(1, `rgba(${hr}, ${hg}, ${hb}, 0)`)
          ctx.fillStyle = glow
          ctx.beginPath()
          ctx.arc(hx, hy, headR, 0, TAU)
          ctx.fill()

          // Émission d'étincelles à cadence fixe (indépendante du framerate) ;
          // `guard` borne les rattrapages quand `dt` est grand.
          if (star.emitAt < 0) star.emitAt = elapsed
          let guard = 0
          while (elapsed - star.emitAt > EMIT_MS && guard++ < 8) {
            star.emitAt += EMIT_MS
            const a = Math.random() * TAU
            const sp = 0.02 + Math.random() * 0.05
            star.sparks.push({
              x: hx,
              y: hy,
              // léger recul (opposé au mouvement) + éclaboussure isotrope
              vx: -dirX * 0.03 + Math.cos(a) * sp,
              vy: -dirY * 0.03 + Math.sin(a) * sp,
              born: elapsed,
              life: 420 + Math.random() * 520,
              size: 0.8 + Math.random() * 1.5,
              phase: Math.random() * TAU,
            })
          }
        }

        // Étincelles : dérive + gravité douce, scintillement, extinction.
        if (star.sparks.length) {
          star.sparks = star.sparks.filter((s) => elapsed - s.born < s.life)
          for (const s of star.sparks) {
            s.vy += SPARK_GRAV * dt
            s.x += s.vx * dt
            s.y += s.vy * dt
            const age = (elapsed - s.born) / s.life
            const tw = 0.62 + 0.38 * Math.sin(s.phase + elapsed * 0.02)
            const a = (1 - age) * tw * globalFade
            if (a <= 0.02) continue
            ctx.fillStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`
            ctx.beginPath()
            ctx.arc(s.x, s.y, s.size, 0, TAU)
            ctx.fill()
            ctx.fillStyle = `rgba(${hr}, ${hg}, ${hb}, ${(a * 0.4).toFixed(3)})`
            ctx.beginPath()
            ctx.arc(s.x, s.y, s.size * 2.3, 0, TAU)
            ctx.fill()
          }
        }
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      return elapsed < DURATION
    },
  }
}

export const shootingStarsEffect: EffectDefinition = {
  id: 'shootingstars',
  label: 'Étoiles filantes',
  hint: 'Deux météores en diagonale, traînée et étincelles',
  durationMs: DURATION,
  create,
}

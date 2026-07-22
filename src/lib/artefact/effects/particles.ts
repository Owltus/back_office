import type { EffectEnv, EffectRunner } from './types.ts'

/*
 * Moteur de particules partagé par les effets « pluie / envol » (neige, pétales,
 * feuilles, confettis, bulles, ballons, cœurs…). Chaque particule tombe (vy > 0)
 * ou monte (vy < 0), avec un balancement horizontal sinusoïdal et une rotation.
 * L'effet ne fournit que `spawn` (états initiaux) et `draw` (forme, dessinée à
 * l'origine — le moteur a déjà posé translation, rotation et opacité).
 *
 * Positions recalculées depuis le temps ABSOLU (aucune dérive). Une particule ne
 * disparaît qu'en SORTANT de l'écran (aucun fondu en plein vol) ; l'effet s'arrête
 * uniquement quand TOUTES sont sorties. Le plafond de durée est assuré en amont
 * par l'overlay (`durationMs + 4000`). Fond effacé net à chaque image.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export interface Particle {
  x: number
  y0: number
  vy: number
  sway: number
  swayFreq: number
  phase: number
  spin: number
  spin0: number
  size: number
  bornAt: number
  hue: number
  seed: number
}

export interface ParticleFieldOptions {
  count: number
  /** Marge hors écran au-delà de laquelle une particule est « sortie ». */
  exitMargin?: number
  spawn: (i: number, width: number, height: number) => Particle
  /** Dessine la particule à l'origine (translation/rotation/alpha déjà posées). */
  draw: (ctx: CanvasRenderingContext2D, p: Particle, age: number) => void
}

export function particleField(
  { ctx, width, height }: EffectEnv,
  opts: ParticleFieldOptions,
): EffectRunner {
  const margin = opts.exitMargin ?? 60
  const parts = Array.from({ length: opts.count }, (_, i) =>
    opts.spawn(i, width, height),
  )
  return {
    frame(elapsed) {
      ctx.clearRect(0, 0, width, height)
      let alive = false
      for (const p of parts) {
        if (elapsed < p.bornAt) {
          alive = true // pas encore apparue
          continue
        }
        const age = elapsed - p.bornAt
        const y = p.y0 + p.vy * age
        if (y > height + margin || y < -margin) continue // sortie de l'écran
        alive = true
        const alpha = clamp01(age / 240) // fondu d'apparition seulement
        if (alpha <= 0.02) continue
        const x = p.x + Math.sin(elapsed * p.swayFreq + p.phase) * p.sway
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(p.spin0 + p.spin * age)
        ctx.globalAlpha = alpha
        opts.draw(ctx, p, age)
        ctx.restore()
      }
      return alive
    },
  }
}

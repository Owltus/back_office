import { particleField } from './particles.ts'

import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'
import type { Particle } from './particles.ts'

/*
 * Volée de cœurs — de petits cœurs roses s'élèvent depuis le bas en flottant,
 * légèrement inclinés et dérivants, jusqu'à SORTIR par le haut. `vy` négatif
 * (montée). Bâti sur le moteur commun `particleField`. (Distinct de « cœur
 * filant » qui traverse l'écran avec un unique cœur.)
 */

const DURATION = 12000
const TAU = Math.PI * 2
const COUNT = 16

// Cœur centré sur l'origine, demi-taille `s` (path classique à 4 courbes).
function heartPath(ctx: CanvasRenderingContext2D, s: number) {
  const d = s * 2
  const y = -s
  const top = d * 0.3
  ctx.beginPath()
  ctx.moveTo(0, y + top)
  ctx.bezierCurveTo(0, y, -s, y, -s, y + top)
  ctx.bezierCurveTo(-s, y + (d + top) / 2, 0, y + (d + top) / 2, 0, y + d)
  ctx.bezierCurveTo(0, y + (d + top) / 2, s, y + (d + top) / 2, s, y + top)
  ctx.bezierCurveTo(s, y, 0, y, 0, y + top)
  ctx.closePath()
}

function create(env: EffectEnv): EffectRunner {
  return particleField(env, {
    count: COUNT,
    exitMargin: 40,
    spawn: (i, w, h): Particle => ({
      x: Math.random() * w,
      y0: h + 20 + Math.random() * 150,
      vy: -(0.12 + Math.random() * 0.07),
      sway: 16 + Math.random() * 26,
      swayFreq: 0.001 + Math.random() * 0.0016,
      phase: Math.random() * TAU,
      spin: 0,
      spin0: (Math.random() - 0.5) * 0.5,
      size: 7 + Math.random() * 7,
      bornAt: (i / COUNT) * 1500 + Math.random() * 240,
      hue: 335 + Math.random() * 15,
      seed: Math.random(),
    }),
    draw: (ctx, p) => {
      ctx.fillStyle = `hsl(${p.hue}, 80%, ${62 + p.seed * 8}%)`
      heartPath(ctx, p.size)
      ctx.fill()
    },
  })
}

export const heartSwarmEffect: EffectDefinition = {
  id: 'heartswarm',
  label: 'Volée de cœurs',
  hint: 'Des petits cœurs roses s’élèvent en flottant',
  durationMs: DURATION,
  create,
}

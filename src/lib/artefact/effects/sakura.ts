import { particleField } from './particles.ts'

import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'
import type { Particle } from './particles.ts'

/*
 * Pétales de cerisier — de petits pétales roses virevoltent en descendant, avec
 * un fort balancement latéral et une rotation lente, jusqu'à SORTIR par le bas.
 * Bâti sur `particleField`.
 */

const DURATION = 12000
const TAU = Math.PI * 2
const COUNT = 26

function create(env: EffectEnv): EffectRunner {
  return particleField(env, {
    count: COUNT,
    exitMargin: 30,
    spawn: (i, w): Particle => ({
      x: Math.random() * w,
      y0: -20 - Math.random() * 160,
      vy: 0.12 + Math.random() * 0.06,
      sway: 24 + Math.random() * 36,
      swayFreq: 0.001 + Math.random() * 0.0018,
      phase: Math.random() * TAU,
      spin: (0.0012 + Math.random() * 0.0022) * (Math.random() < 0.5 ? -1 : 1),
      spin0: Math.random() * TAU,
      size: 6 + Math.random() * 5,
      bornAt: (i / COUNT) * 1300 + Math.random() * 220,
      hue: 335 + Math.random() * 14,
      seed: Math.random(),
    }),
    draw: (ctx, p) => {
      ctx.fillStyle = `hsl(${p.hue}, 72%, ${72 + p.seed * 8}%)`
      ctx.beginPath()
      ctx.ellipse(0, 0, p.size, p.size * 0.58, 0, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = `hsla(${p.hue}, 60%, 92%, 0.5)`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, -p.size * 0.5)
      ctx.lineTo(0, p.size * 0.5)
      ctx.stroke()
    },
  })
}

export const sakuraEffect: EffectDefinition = {
  id: 'sakura',
  label: 'Pétales de cerisier',
  hint: 'Des pétales roses virevoltent en tombant',
  durationMs: DURATION,
  create,
}

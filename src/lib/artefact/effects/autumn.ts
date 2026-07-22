import { particleField } from './particles.ts'

import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'
import type { Particle } from './particles.ts'

/*
 * Feuilles d'automne — des feuilles (amande + nervure) aux tons chauds descendent
 * en planant, tournoient et dérivent, jusqu'à SORTIR par le bas. Bâti sur
 * `particleField`.
 */

const DURATION = 12000
const TAU = Math.PI * 2
const COUNT = 22
/** Palette automnale — l'index est tiré du `seed` de la particule. */
const COLORS = ['#c9702e', '#b0472a', '#d1a23f', '#9a5a2b', '#c1552d']

function create(env: EffectEnv): EffectRunner {
  return particleField(env, {
    count: COUNT,
    exitMargin: 40,
    spawn: (i, w): Particle => ({
      x: Math.random() * w,
      y0: -30 - Math.random() * 160,
      vy: 0.12 + Math.random() * 0.06,
      sway: 20 + Math.random() * 34,
      swayFreq: 0.001 + Math.random() * 0.0016,
      phase: Math.random() * TAU,
      spin: (0.0012 + Math.random() * 0.0026) * (Math.random() < 0.5 ? -1 : 1),
      spin0: Math.random() * TAU,
      size: 8 + Math.random() * 7,
      bornAt: (i / COUNT) * 1400 + Math.random() * 220,
      hue: 0,
      seed: Math.random(),
    }),
    draw: (ctx, p) => {
      ctx.fillStyle = COLORS[Math.floor(p.seed * COLORS.length)]
      ctx.beginPath()
      ctx.moveTo(0, -p.size)
      ctx.quadraticCurveTo(p.size * 0.72, 0, 0, p.size)
      ctx.quadraticCurveTo(-p.size * 0.72, 0, 0, -p.size)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(60, 30, 10, 0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, -p.size * 0.85)
      ctx.lineTo(0, p.size * 0.85)
      ctx.stroke()
    },
  })
}

export const autumnEffect: EffectDefinition = {
  id: 'autumn',
  label: 'Feuilles d’automne',
  hint: 'Des feuilles aux tons chauds descendent en planant',
  durationMs: DURATION,
  create,
}

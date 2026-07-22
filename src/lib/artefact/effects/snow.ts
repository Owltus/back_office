import { particleField } from './particles.ts'

import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'
import type { Particle } from './particles.ts'

/*
 * Neige — des flocons blancs de tailles variées tombent doucement en dérivant,
 * jusqu'à SORTIR par le bas (aucun fondu en plein vol). Bâti sur `particleField`.
 */

const DURATION = 13000
const TAU = Math.PI * 2
const COUNT = 55

function create(env: EffectEnv): EffectRunner {
  return particleField(env, {
    count: COUNT,
    exitMargin: 16,
    spawn: (i, w): Particle => ({
      x: Math.random() * w,
      y0: -20 - Math.random() * 200,
      vy: 0.12 + Math.random() * 0.06,
      sway: 8 + Math.random() * 24,
      swayFreq: 0.0008 + Math.random() * 0.0016,
      phase: Math.random() * TAU,
      spin: 0,
      spin0: 0,
      size: 1.5 + Math.random() * 3.4,
      bornAt: (i / COUNT) * 1300 + Math.random() * 200,
      hue: 0,
      seed: Math.random(),
    }),
    draw: (ctx, p) => {
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.5 + p.seed * 0.5).toFixed(2)})`
      ctx.beginPath()
      ctx.arc(0, 0, p.size, 0, TAU)
      ctx.fill()
    },
  })
}

export const snowEffect: EffectDefinition = {
  id: 'snow',
  label: 'Neige',
  hint: 'Des flocons blancs tombent doucement jusqu’en bas',
  durationMs: DURATION,
  create,
}

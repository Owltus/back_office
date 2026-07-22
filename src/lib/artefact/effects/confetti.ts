import { particleField } from './particles.ts'

import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'
import type { Particle } from './particles.ts'

/*
 * Confettis — une averse dense de petits rectangles multicolores qui tombent en
 * tournoyant vite, jusqu'à SORTIR par le bas. Chute plus rapide : c'est vif et
 * festif. Bâti sur `particleField`.
 */

const DURATION = 9000
const TAU = Math.PI * 2
const COUNT = 46

function create(env: EffectEnv): EffectRunner {
  return particleField(env, {
    count: COUNT,
    exitMargin: 24,
    spawn: (i, w): Particle => ({
      x: Math.random() * w,
      y0: -20 - Math.random() * 140,
      vy: 0.18 + Math.random() * 0.1,
      sway: 14 + Math.random() * 28,
      swayFreq: 0.0012 + Math.random() * 0.0024,
      phase: Math.random() * TAU,
      spin: (0.003 + Math.random() * 0.005) * (Math.random() < 0.5 ? -1 : 1),
      spin0: Math.random() * TAU,
      size: 6 + Math.random() * 6,
      bornAt: (i / COUNT) * 900 + Math.random() * 160,
      hue: Math.random() * 360,
      seed: Math.random(),
    }),
    draw: (ctx, p) => {
      ctx.fillStyle = `hsl(${p.hue}, 78%, 56%)`
      ctx.fillRect(-p.size / 2, -p.size * 0.32, p.size, p.size * 0.64)
    },
  })
}

export const confettiEffect: EffectDefinition = {
  id: 'confetti',
  label: 'Confettis',
  hint: 'Une averse de confettis multicolores',
  durationMs: DURATION,
  create,
}

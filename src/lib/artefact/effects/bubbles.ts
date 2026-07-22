import { particleField } from './particles.ts'

import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'
import type { Particle } from './particles.ts'

/*
 * Bulles de savon — des bulles translucides et irisées montent depuis le bas en
 * ondulant, de tailles variées, avec un reflet, jusqu'à SORTIR par le haut. `vy`
 * négatif (montée). Bâti sur le moteur commun `particleField`.
 */

const DURATION = 13000
const TAU = Math.PI * 2
const COUNT = 20

function create(env: EffectEnv): EffectRunner {
  return particleField(env, {
    count: COUNT,
    exitMargin: 40,
    spawn: (i, w, h): Particle => ({
      x: Math.random() * w,
      y0: h + 20 + Math.random() * 160,
      vy: -(0.11 + Math.random() * 0.06),
      sway: 12 + Math.random() * 26,
      swayFreq: 0.001 + Math.random() * 0.0018,
      phase: Math.random() * TAU,
      spin: 0,
      spin0: 0,
      size: 8 + Math.random() * 16,
      bornAt: (i / COUNT) * 1600 + Math.random() * 220,
      hue: 180 + Math.random() * 150,
      seed: Math.random(),
    }),
    draw: (ctx, p) => {
      ctx.beginPath()
      ctx.arc(0, 0, p.size, 0, TAU)
      ctx.fillStyle = `hsla(${p.hue}, 65%, 78%, 0.12)`
      ctx.fill()
      ctx.strokeStyle = `hsla(${p.hue}, 70%, 85%, 0.5)`
      ctx.lineWidth = 1.2
      ctx.stroke()
      // Reflet brillant en haut à gauche.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.beginPath()
      ctx.ellipse(
        -p.size * 0.35,
        -p.size * 0.35,
        p.size * 0.2,
        p.size * 0.12,
        -0.6,
        0,
        TAU,
      )
      ctx.fill()
    },
  })
}

export const bubblesEffect: EffectDefinition = {
  id: 'bubbles',
  label: 'Bulles de savon',
  hint: 'Des bulles irisées montent et ondulent',
  durationMs: DURATION,
  create,
}

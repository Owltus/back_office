import { particleField } from './particles.ts'

import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'
import type { Particle } from './particles.ts'

/*
 * Ballons — quelques ballons colorés s'élèvent depuis le bas, légèrement inclinés,
 * avec un nœud, une ficelle ondulante et un reflet, jusqu'à SORTIR par le haut.
 * `vy` négatif (montée). Bâti sur le moteur commun `particleField`.
 */

const DURATION = 14000
const TAU = Math.PI * 2
const COUNT = 10

function create(env: EffectEnv): EffectRunner {
  return particleField(env, {
    count: COUNT,
    exitMargin: 70,
    spawn: (i, w, h): Particle => ({
      x: Math.random() * w,
      y0: h + 60 + Math.random() * 160,
      vy: -(0.11 + Math.random() * 0.05),
      sway: 8 + Math.random() * 16,
      swayFreq: 0.0008 + Math.random() * 0.0012,
      phase: Math.random() * TAU,
      spin: 0,
      spin0: (Math.random() - 0.5) * 0.4,
      size: 18 + Math.random() * 12,
      bornAt: (i / COUNT) * 1600 + Math.random() * 260,
      hue: Math.random() * 360,
      seed: Math.random(),
    }),
    draw: (ctx, p) => {
      const s = p.size
      // Ficelle qui pend sous le ballon.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, s * 1.12)
      ctx.quadraticCurveTo(s * 0.35, s * 1.9, 0, s * 2.7)
      ctx.stroke()
      // Corps du ballon.
      ctx.fillStyle = `hsl(${p.hue}, 68%, 58%)`
      ctx.beginPath()
      ctx.ellipse(0, 0, s * 0.82, s, 0, 0, TAU)
      ctx.fill()
      // Nœud.
      ctx.beginPath()
      ctx.moveTo(-s * 0.12, s)
      ctx.lineTo(s * 0.12, s)
      ctx.lineTo(0, s * 1.16)
      ctx.closePath()
      ctx.fill()
      // Reflet.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.beginPath()
      ctx.ellipse(-s * 0.3, -s * 0.34, s * 0.16, s * 0.26, -0.4, 0, TAU)
      ctx.fill()
    },
  })
}

export const balloonsEffect: EffectDefinition = {
  id: 'balloons',
  label: 'Ballons',
  hint: 'Des ballons colorés s’élèvent en oscillant',
  durationMs: DURATION,
  create,
}

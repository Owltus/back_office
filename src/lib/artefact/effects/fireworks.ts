import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Feu d'artifice — des fusées montent depuis le bas puis explosent en gerbes
 * colorées ; gravité + friction + traînées (composite `destination-out` pour
 * l'estompe, `lighter` pour l'accumulation). Joué par le bouton de la page
 * Artefact comme par l'easter egg clavier « chloé » (`SecretEffect`).
 *
 * L'animation intègre PAR IMAGE (calibrée ~60 fps). On la normalise ici
 * par `dt` (`step = dt / FRAME`) : le rendu reste IDENTIQUE à 60 fps (step ≈ 1) et
 * résiste à un changement de framerate — le contrat des effets borne déjà `dt`.
 */

const DURATION = 7000
const GRAVITY = 0.045
const FRICTION = 0.985
const FRAME = 1000 / 60
/** Teintes festives : or, orange, rouge, rose, violet, bleu, cyan, vert. */
const HUES = [45, 30, 0, 320, 280, 210, 190, 140]
const TAU = Math.PI * 2

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  decay: number
  hue: number
  kind: 'rocket' | 'spark'
  targetY: number
}

function create({ ctx, width, height }: EffectEnv): EffectRunner {
  const parts: Particle[] = []
  let lastLaunch = -Infinity

  const launchRocket = () => {
    const targetY = height * (0.12 + Math.random() * 0.35)
    const hue = HUES[Math.floor(Math.random() * HUES.length)]
    parts.push({
      x: width * (0.15 + Math.random() * 0.7),
      y: height + 10,
      vx: (Math.random() - 0.5) * 1.2,
      vy: -(Math.sqrt(2 * GRAVITY * (height - targetY)) + Math.random() * 1.5),
      life: 1,
      decay: 0,
      hue,
      kind: 'rocket',
      targetY,
    })
  }

  const explode = (x: number, y: number, hue: number) => {
    const count = 60 + Math.floor(Math.random() * 40)
    for (let i = 0; i < count; i++) {
      const angle = (TAU * i) / count + Math.random() * 0.25
      const speed = Math.random() * 4 + 1.5
      parts.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.008 + Math.random() * 0.013,
        hue: hue + (Math.random() * 30 - 15),
        kind: 'spark',
        targetY: 0,
      })
    }
  }

  return {
    frame(elapsed, dt) {
      const step = dt / FRAME

      // Traînée : on ESTOMPE l'image précédente au lieu de l'effacer d'un coup.
      // L'estompe par image (0.18) devient cumulative sur `step` images.
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = `rgba(0, 0, 0, ${(1 - Math.pow(1 - 0.18, step)).toFixed(3)})`
      ctx.fillRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'

      // Tir de fusées pendant la première partie de l'animation.
      if (elapsed < DURATION - 1500 && elapsed - lastLaunch > 320) {
        lastLaunch = elapsed
        launchRocket()
        if (Math.random() < 0.4) launchRocket()
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        if (p.kind === 'rocket') {
          p.vy += GRAVITY * step
          p.x += p.vx * step
          p.y += p.vy * step
          ctx.beginPath()
          ctx.fillStyle = `hsl(${p.hue}, 100%, 75%)`
          ctx.arc(p.x, p.y, 2.2, 0, TAU)
          ctx.fill()
          if (p.vy >= 0 || p.y <= p.targetY) {
            explode(p.x, p.y, p.hue)
            parts.splice(i, 1)
          }
        } else {
          const fr = Math.pow(FRICTION, step)
          p.vx *= fr
          p.vy = p.vy * fr + GRAVITY * step
          p.x += p.vx * step
          p.y += p.vy * step
          p.life -= p.decay * step
          if (p.life <= 0) {
            parts.splice(i, 1)
            continue
          }
          ctx.beginPath()
          ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${p.life.toFixed(3)})`
          ctx.arc(p.x, p.y, 2 * p.life + 0.5, 0, TAU)
          ctx.fill()
        }
      }

      ctx.globalCompositeOperation = 'source-over'
      // On tourne tant que des fusées partent (elapsed < DURATION) OU qu'il reste
      // des gerbes à éteindre — sinon l'effet se coupe en plein ciel.
      return elapsed < DURATION || parts.length > 0
    },
  }
}

export const fireworksEffect: EffectDefinition = {
  id: 'fireworks',
  label: 'Feu d’artifice',
  hint: 'Fusées et gerbes colorées, l’easter egg « chloé »',
  // Cap dur : au-delà du tir (7 s), on laisse ~2,5 s aux dernières gerbes.
  durationMs: DURATION + 2500,
  create,
}

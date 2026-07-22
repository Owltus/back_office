import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Cœur filant — un petit cœur rose stylisé (dégradé + halo + reflet) traverse
 * l'écran d'un bout à l'autre en ONDULANT légèrement (sinus perpendiculaire) et en
 * battant doucement. La trajectoire (direction + décalage) est TIRÉE AU HASARD à
 * chaque déclenchement : le départ
 * et l'arrivée ne tombent jamais au même endroit. Durée calée sur la pluie de
 * billets. Non bloquant : l'overlay est en `pointer-events: none`.
 */

const DURATION = 6000
const TAU = Math.PI * 2
const SIZE = 20
/** Ondulation légère autour de la ligne de traversée. */
const WAVES = 2.5
const WAVE_AMP = 34

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

// Path d'un cœur centré sur (cx, cy), demi-taille `s` (le cœur fait ~2s × 2s).
function heartPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
) {
  const d = s * 2
  const y = cy - s
  const top = d * 0.3
  ctx.beginPath()
  ctx.moveTo(cx, y + top)
  ctx.bezierCurveTo(cx, y, cx - s, y, cx - s, y + top)
  ctx.bezierCurveTo(cx - s, y + (d + top) / 2, cx, y + (d + top) / 2, cx, y + d)
  ctx.bezierCurveTo(
    cx,
    y + (d + top) / 2,
    cx + s,
    y + (d + top) / 2,
    cx + s,
    y + top,
  )
  ctx.bezierCurveTo(cx + s, y, cx, y, cx, y + top)
  ctx.closePath()
}

function create({ ctx, width, height }: EffectEnv): EffectRunner {
  const cx = width / 2
  const cy = height / 2
  const diag = Math.hypot(width, height)
  // Direction de traversée + décalage perpendiculaire, aléatoires.
  const angle = Math.random() * TAU
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const px = -dy // perpendiculaire unitaire à la direction
  const py = dx
  const offset = (Math.random() - 0.5) * Math.min(width, height) * 0.55
  const half = diag * 0.5 + 90 // juste hors écran aux deux extrémités
  const mx = cx + px * offset
  const my = cy + py * offset
  const sx = mx - dx * half
  const sy = my - dy * half
  const ex = mx + dx * half
  const ey = my + dy * half

  return {
    frame(elapsed) {
      ctx.clearRect(0, 0, width, height)
      const t = clamp01(elapsed / DURATION)
      // Trajectoire = ligne start→end + légère ondulation perpendiculaire.
      const wave = Math.sin(t * TAU * WAVES) * WAVE_AMP
      const x = sx + (ex - sx) * t + px * wave
      const y = sy + (ey - sy) * t + py * wave
      const s = SIZE * (1 + Math.sin(elapsed * 0.006) * 0.08) // battement doux

      // Corps du cœur : dégradé rose vertical + halo.
      ctx.save()
      ctx.shadowColor = 'rgba(255, 105, 170, 0.6)'
      ctx.shadowBlur = 16
      const grad = ctx.createLinearGradient(x, y - s, x, y + s)
      grad.addColorStop(0, '#ff9ec7')
      grad.addColorStop(1, '#ff4f9a')
      ctx.fillStyle = grad
      heartPath(ctx, x, y, s)
      ctx.fill()
      ctx.restore()

      // Reflet brillant en haut à gauche — touche « glossy ».
      ctx.save()
      ctx.globalAlpha = 0.5
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.ellipse(x - s * 0.42, y - s * 0.36, s * 0.24, s * 0.14, -0.5, 0, TAU)
      ctx.fill()
      ctx.restore()

      return elapsed < DURATION
    },
  }
}

export const heartEffect: EffectDefinition = {
  id: 'heart',
  label: 'Cœur filant',
  hint: 'Un petit cœur rose traverse l’écran',
  durationMs: DURATION,
  create,
}

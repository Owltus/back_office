import { useEffect, useRef } from 'react'

/*
 * Fond étoilé (canvas) pour la page galaxie. Purement décoratif.
 *
 * Perf : les étoiles sont tirées UNE fois (positions et opacités en fractions
 * 0..1), puis redessinées à l'échelle du parent. Le redimensionnement est
 * coalescé par requestAnimationFrame et court-circuité si la taille n'a pas
 * bougé — un ResizeObserver peut tirer plusieurs fois par frame.
 */

const STAR_COUNT = 320

interface Star {
  x: number // fraction 0..1
  y: number
  r: number // rayon px
  a: number // opacité
}

function makeStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.1 + 0.2,
    a: 0.08 + Math.random() * 0.5,
  }))
}

export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    const parent = c?.parentElement
    const ctx = c?.getContext('2d')
    if (!c || !parent || !ctx) return

    const stars = makeStars()
    let w = -1
    let h = -1
    let frame = 0

    const paint = () => {
      frame = 0
      const nw = parent.clientWidth
      const nh = parent.clientHeight
      if (nw === w && nh === h) return // taille inchangée : rien à repeindre
      w = nw
      h = nh
      c.width = w
      c.height = h
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#ffffff'
      for (const s of stars) {
        ctx.globalAlpha = s.a
        ctx.beginPath()
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }

    paint()
    const ro = new ResizeObserver(schedule)
    ro.observe(parent)
    return () => {
      ro.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <canvas ref={ref} className="absolute inset-0 z-0" aria-hidden="true" />
  )
}

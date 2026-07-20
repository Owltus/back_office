import { useEffect, useRef, useState } from 'react'

/*
 * Easter egg — taper « chloé » (n'importe où, à la Konami) déclenche un feu
 * d'artifice plein écran.
 *
 * - Détecteur de séquence : buffer glissant des dernières frappes, insensible à
 *   la casse ET aux accents (« chloé » comme « chloe » marchent).
 * - Feu d'artifice : canvas à particules — des fusées montent puis explosent en
 *   gerbes colorées (gravité + friction + traînées via composite destination-out
 *   / lighter, le classique des démos canvas). L'overlay est en `pointer-events:
 *   none` : il n'intercepte JAMAIS les clics ni la saisie, donc « peu importe où »
 *   sans rien casser. S'auto-nettoie à la fin.
 * - SSR-safe : rend `null` tant qu'inactif (aucune divergence d'hydratation) ;
 *   l'écouteur clavier est posé côté client dans un effet.
 */

const SEQUENCE = 'chloe'
const DURATION_MS = 7000
const GRAVITY = 0.045
const FRICTION = 0.985
// Teintes festives : or, orange, rouge, rose, violet, bleu, cyan, vert.
const HUES = [45, 30, 0, 320, 280, 210, 190, 140]

// Une frappe → minuscule sans accent : NFD décompose « é » en « e » + accent
// combinant, et on ne garde que les lettres a–z (l'accent et les autres touches
// sont ignorés). « chloé » comme « chloe » produisent donc « chloe ».
function normalizeKey(key: string): string {
  return key.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')
}

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

export function SecretFireworks() {
  const [active, setActive] = useState(false)
  const bufferRef = useRef('')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Détecteur de séquence clavier, monté une seule fois.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.length !== 1) return // ignore Shift, Entrée, flèches, etc.
      const typed = normalizeKey(e.key)
      if (!typed) return // touche non-lettre : n'altère pas le buffer
      const next = (bufferRef.current + typed).slice(-SEQUENCE.length)
      bufferRef.current = next
      if (next === SEQUENCE) {
        bufferRef.current = ''
        setActive(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Animation, uniquement pendant que c'est actif.
  useEffect(() => {
    if (!active) return
    const canvasEl = canvasRef.current
    if (!canvasEl) return
    const context = canvasEl.getContext('2d')
    if (!context) return
    // Types non-null explicites : conservent le narrowing dans resize()/frame().
    const canvas: HTMLCanvasElement = canvasEl
    const ctx: CanvasRenderingContext2D = context

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    function resize() {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const w = () => window.innerWidth
    const h = () => window.innerHeight
    const parts: Particle[] = []

    function launchRocket() {
      const targetY = h() * (0.12 + Math.random() * 0.35)
      const hue = HUES[Math.floor(Math.random() * HUES.length)]
      parts.push({
        x: w() * (0.15 + Math.random() * 0.7),
        y: h() + 10,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -(Math.sqrt(2 * GRAVITY * (h() - targetY)) + Math.random() * 1.5),
        life: 1,
        decay: 0,
        hue,
        kind: 'rocket',
        targetY,
      })
    }

    function explode(x: number, y: number, hue: number) {
      const count = 60 + Math.floor(Math.random() * 40)
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.25
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

    let raf = 0
    let stopped = false
    let start = 0
    let lastLaunch = 0

    function frame(now: number) {
      if (stopped) return
      if (!start) start = now
      const elapsed = now - start

      // Traînée : on estompe l'image précédente au lieu de l'effacer d'un coup.
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
      ctx.fillRect(0, 0, w(), h())
      ctx.globalCompositeOperation = 'lighter'

      // Tir de fusées pendant la première partie de l'animation.
      if (elapsed < DURATION_MS - 1500 && now - lastLaunch > 320) {
        lastLaunch = now
        launchRocket()
        if (Math.random() < 0.4) launchRocket()
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        if (p.kind === 'rocket') {
          p.vy += GRAVITY
          p.x += p.vx
          p.y += p.vy
          ctx.beginPath()
          ctx.fillStyle = `hsl(${p.hue}, 100%, 75%)`
          ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2)
          ctx.fill()
          if (p.vy >= 0 || p.y <= p.targetY) {
            explode(p.x, p.y, p.hue)
            parts.splice(i, 1)
          }
        } else {
          p.vx *= FRICTION
          p.vy = p.vy * FRICTION + GRAVITY
          p.x += p.vx
          p.y += p.vy
          p.life -= p.decay
          if (p.life <= 0) {
            parts.splice(i, 1)
            continue
          }
          ctx.beginPath()
          ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${p.life})`
          ctx.arc(p.x, p.y, 2 * p.life + 0.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      if (elapsed >= DURATION_MS && parts.length === 0) {
        setActive(false)
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    // Filet de sécurité : arrêt dur si jamais l'anim traîne.
    const hardStop = window.setTimeout(() => setActive(false), DURATION_MS + 3000)

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      window.clearTimeout(hardStop)
      window.removeEventListener('resize', resize)
    }
  }, [active])

  if (!active) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden"
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'

import type { EffectDefinition } from '#/lib/artefact/effects/index.ts'

/*
 * Moteur de rendu commun à TOUS les effets visuels : la page Artefact (boutons)
 * comme les easter eggs clavier (`components/shared/SecretEffect.tsx`).
 *
 * Canvas plein écran en `pointer-events: none`, boucle `requestAnimationFrame`,
 * densité de pixels bornée, nettoyage strict — le tout séparé de tout effet
 * particulier : l'effet à jouer arrive par la prop `effect`, chaque définition ne
 * décrivant que ce qu'elle peint image par image (voir
 * `lib/artefact/effects/types.ts`).
 *
 * On passe la définition en prop plutôt que de la sélectionner par une clé : le
 * parent garde la maîtrise du cycle « armer / rejouer / arrêter » via la `key`
 * React, ce qui remonte proprement un effet même si l'utilisateur reclique le
 * même bouton.
 */

interface EffectOverlayProps {
  effect: EffectDefinition
  /** Appelé quand l'effet se termine (naturellement ou par arrêt dur). */
  onDone: () => void
}

export function EffectOverlay({ effect, onDone }: EffectOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // onDone dans une ref : l'effet de rendu ne doit tourner qu'UNE fois, il ne
  // faut pas le relancer parce que le parent a recréé la fonction.
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const canvasEl = canvasRef.current
    if (!canvasEl) return
    const context = canvasEl.getContext('2d')
    if (!context) return
    const canvas: HTMLCanvasElement = canvasEl
    const ctx: CanvasRenderingContext2D = context

    // Plafonné à 2 : au-delà, le coût de remplissage explose sans gain visible.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    function resize() {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      // Le repère de dessin est en pixels CSS : les effets raisonnent en
      // dimensions d'écran, pas en pixels physiques.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const runner = effect.create({
      ctx,
      width: window.innerWidth,
      height: window.innerHeight,
    })

    let raf = 0
    let stopped = false
    let start = 0
    let last = 0

    function frame(now: number) {
      if (stopped) return
      if (!start) {
        start = now
        last = now
      }
      const elapsed = now - start
      // dt borné à 50 ms : un retour d'onglet en arrière-plan livrerait sinon un
      // dt de plusieurs secondes qui ferait diverger toutes les intégrations.
      const dt = Math.min(now - last, 50)
      last = now

      // L'overlay N'EFFACE PAS : chaque effet gère son propre fond (net ou
      // traînée). Effacer ici casserait les effets à rémanence.
      const alive = runner.frame(elapsed, dt)
      if (!alive || elapsed > effect.durationMs + 4000) {
        stopped = true
        onDoneRef.current()
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [effect])

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9998] overflow-hidden"
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  )
}

/*
 * Petit hook de confort : arme un effet, expose l'overlay à monter, et se
 * réarme à chaque déclenchement grâce à un compteur qui alimente la `key`.
 */
export function useEffectTrigger() {
  const [state, setState] = useState<{
    effect: EffectDefinition
    runId: number
  } | null>(null)
  const runIdRef = useRef(0)

  function trigger(effect: EffectDefinition) {
    runIdRef.current += 1
    setState({ effect, runId: runIdRef.current })
  }

  const overlay = state ? (
    <EffectOverlay
      key={state.runId}
      effect={state.effect}
      onDone={() => setState(null)}
    />
  ) : null

  return { trigger, overlay, activeId: state?.effect.id ?? null }
}

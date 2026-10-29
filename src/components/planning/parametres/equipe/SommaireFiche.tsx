/*
 * Sommaire collant de la fiche d'une personne (audit des paramètres du
 * 2026-10-28 : la fiche faisait ~3 000 px). Une pastille par partie ; un
 * clic y amène, la partie visible reste en évidence. Les parties sont les
 * <section data-partie="…"> de la zone qui défile (`Section`, `CalendrierEcole`).
 */

import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

import { cn } from '#/lib/utils.ts'

export interface Partie {
  libelle: string
  /** Valeur de l'attribut data-partie de la section visée. */
  partie: string
}

export function SommaireFiche({
  parties,
  zone,
  depart,
}: {
  parties: Partie[]
  /** La zone qui défile (la fiche). */
  zone: RefObject<HTMLDivElement | null>
  /** Partie où ouvrir la fiche (lien d'un point à corriger), sinon le haut. */
  depart?: string
}) {
  const [active, setActive] = useState(parties[0]?.partie)
  const cible = useRef<string | null>(null)

  // Ouverte par un lien : la fiche va d'emblée à la partie visée, une fois.
  // Une partie absente (l'école d'un salarié) laisse la fiche en haut.
  const departFait = useRef(false)
  useEffect(() => {
    if (departFait.current || !depart) return
    departFait.current = true
    const s = zone.current?.querySelector(`[data-partie="${depart}"]`)
    if (!s) return
    cible.current = depart
    setActive(depart)
    s.scrollIntoView({ block: 'start' })
  }, [depart, zone])

  useEffect(() => {
    const el = zone.current
    if (!el) return
    let precedent = el.scrollTop
    const suivre = () => {
      // Remonter rend la main au suivi ; en bas de la fiche, une partie
      // courte ne peut pas atteindre le haut : la partie cliquée reste.
      if (el.scrollTop < precedent) cible.current = null
      precedent = el.scrollTop
      const enBas = el.scrollTop + el.clientHeight >= el.scrollHeight - 2
      if (enBas && cible.current) {
        setActive(cible.current)
        return
      }
      const haut = el.getBoundingClientRect().top + 56
      let courante = parties[0]?.partie
      for (const p of parties) {
        const s = el.querySelector(`[data-partie="${p.partie}"]`)
        if (s && s.getBoundingClientRect().top <= haut) courante = p.partie
      }
      setActive(courante)
    }
    suivre()
    el.addEventListener('scroll', suivre, { passive: true })
    return () => el.removeEventListener('scroll', suivre)
  }, [zone, parties])

  const aller = (partie: string) => {
    cible.current = partie
    setActive(partie)
    zone.current
      ?.querySelector(`[data-partie="${partie}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav
      aria-label="Parties de la fiche"
      className="sticky top-0 z-10 -mx-4 -mt-4 flex flex-wrap gap-1.5 border-b bg-background/95 px-4 py-2 backdrop-blur"
    >
      {parties.map((p) => (
        <button
          key={p.partie}
          type="button"
          aria-current={active === p.partie ? 'true' : undefined}
          onClick={() => aller(p.partie)}
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:bg-muted',
            active === p.partie
              ? 'border-primary bg-primary/15 text-foreground'
              : 'text-muted-foreground',
          )}
        >
          {p.libelle}
        </button>
      ))}
    </nav>
  )
}

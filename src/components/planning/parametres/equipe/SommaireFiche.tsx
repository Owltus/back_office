/*
 * Partie de départ de la fiche d'une personne. Le sommaire collant (pastilles
 * Identité, Postes, Horaires…) est RETIRÉ le 2026-11-01 à la demande de
 * l'utilisateur (« ça prend de la place pour rien ») ; il reste son seul
 * service invisible : ouverte par un lien d'un point à corriger, la fiche va
 * d'emblée à la partie visée, une fois. Les parties sont les
 * <section data-partie="…"> de la zone qui défile (`Section`, `CalendrierEcole`).
 */

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

export function useDepartFiche(
  /** La zone qui défile (la fiche). */
  zone: RefObject<HTMLDivElement | null>,
  /** Partie où ouvrir la fiche, sinon le haut. Une partie absente (l'école
   * d'un salarié) laisse la fiche en haut. */
  depart?: string,
): void {
  const fait = useRef(false)
  useEffect(() => {
    if (fait.current || !depart) return
    fait.current = true
    zone.current
      ?.querySelector(`[data-partie="${depart}"]`)
      ?.scrollIntoView({ block: 'start' })
  }, [depart, zone])
}

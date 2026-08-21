import { useEffect } from 'react'
import type { ReactNode } from 'react'

/*
 * Contenu que la page courante pose dans la barre du haut globale (Navbar),
 * à côté du nom de page (mobile uniquement, là où la Navbar affiche déjà ce
 * nom à la place de la marque « Back Office ») :
 *   - le SOUS-TITRE : petit texte discret sous le nom de page (ex. le jour
 *     affiché sur Rapprochement, une fois déplacé hors du corps de page) ;
 *   - le BADGE : une icône de statut alignée à côté du bouton hamburger (ex.
 *     le cadenas clôturé/ouvert de Rapprochement).
 *
 * Deux stores minimaux hors-React (même patron que `lib/theme.ts`) : la Navbar
 * est un frère de `<main>`, pas un parent des boards — un contexte React
 * classique imposerait de faire remonter chaque board jusqu'à un ancêtre
 * commun. Une page qui ne pose rien laisse la Navbar afficher son défaut
 * (nom de page seul, pas de badge).
 */

type Listener = () => void

function createSlot<T>(initial: T) {
  let value = initial
  const listeners = new Set<Listener>()
  return {
    get: (): T => value,
    subscribe: (listener: Listener): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set: (next: T): void => {
      value = next
      for (const listener of listeners) listener()
    },
  }
}

const subtitleSlot = createSlot<ReactNode>(null)
const badgeSlot = createSlot<ReactNode>(null)

export const getNavbarSubtitle = subtitleSlot.get
export const subscribeNavbarSubtitle = subtitleSlot.subscribe
export const getNavbarBadge = badgeSlot.get
export const subscribeNavbarBadge = badgeSlot.subscribe

/**
 * Pose le sous-titre pendant que le composant appelant est monté, le retire à
 * son démontage (changement de page) — jamais besoin de le faire soi-même.
 */
export function useNavbarSubtitle(node: ReactNode): void {
  useEffect(() => {
    subtitleSlot.set(node)
    return () => subtitleSlot.set(null)
  }, [node])
}

/** Même mécanique que `useNavbarSubtitle`, pour le badge à côté du hamburger. */
export function useNavbarBadge(node: ReactNode): void {
  useEffect(() => {
    badgeSlot.set(node)
    return () => badgeSlot.set(null)
  }, [node])
}

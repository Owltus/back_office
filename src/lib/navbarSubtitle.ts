import { useEffect } from 'react'
import type { ReactNode } from 'react'

/*
 * Sous-titre de la barre du haut globale (Navbar) : petit texte discret sous
 * le nom de la page, en mobile uniquement (là où la Navbar affiche déjà ce
 * nom à la place de la marque « Back Office »). Sert typiquement à afficher
 * le jour affiché par la page courante (Rapprochement : « Vendredi 21 août
 * 2026 »), une fois ce jour déplacé hors du corps de la page.
 *
 * Store minimal hors-React (même patron que `lib/theme.ts`) : la Navbar est un
 * frère de `<main>`, pas un parent des boards — un contexte React classique
 * imposerait de faire remonter chaque board jusqu'à un ancêtre commun. Une
 * page qui ne pose rien laisse la Navbar afficher uniquement le nom de la
 * page (comportement par défaut, inchangé).
 */

type Listener = () => void

let subtitle: ReactNode = null
const listeners = new Set<Listener>()

export function getNavbarSubtitle(): ReactNode {
  return subtitle
}

export function subscribeNavbarSubtitle(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setNavbarSubtitle(node: ReactNode): void {
  subtitle = node
  for (const listener of listeners) listener()
}

/**
 * Pose le sous-titre pendant que le composant appelant est monté, le retire à
 * son démontage (changement de page) — jamais besoin de le faire soi-même.
 */
export function useNavbarSubtitle(node: ReactNode): void {
  useEffect(() => {
    setNavbarSubtitle(node)
    return () => setNavbarSubtitle(null)
  }, [node])
}

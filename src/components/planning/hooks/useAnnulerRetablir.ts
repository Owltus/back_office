/*
 * Ctrl+Z / Ctrl+Y sur le planning (Cmd sur Mac ; Ctrl+Maj+Z rétablit aussi),
 * demande utilisateur du 2026-11-18. La mécanique est dans
 * `lib/planning/annulation.ts` ; ici, les touches et le message.
 *
 * Les touches sont laissées au navigateur dans un champ de saisie et quand une
 * fenêtre ou un menu est ouvert (Ctrl+Z y annule la frappe, pas le planning).
 */

import { useEffect, useRef } from 'react'

import {
  annuler,
  peutAnnuler,
  peutRetablir,
  retablir,
} from '#/lib/planning/annulation.ts'

export type Sens = 'annuler' | 'retablir'

/** Le raccourci de ce clavier, ou null. */
export function sensDuRaccourci(e: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}): Sens | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null
  const k = e.key.toLowerCase()
  if (k === 'z') return e.shiftKey ? 'retablir' : 'annuler'
  if (k === 'y' && !e.shiftKey) return 'retablir'
  return null
}

/** La cible garde ses propres raccourcis (champ, zone éditable). */
export function cibleDeSaisie(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  return (
    t.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) ||
    !!t.closest('[role=dialog], [role=alertdialog], [role=menu]')
  )
}

/** « Annulé : 3 cases remises comme avant. » */
export function messageAnnulation(sens: Sens, n: number): string {
  const cases = `${n} case${n > 1 ? 's' : ''}`
  return sens === 'annuler'
    ? `Annulé : ${cases} remise${n > 1 ? 's' : ''} comme avant (Ctrl+Y pour rétablir).`
    : `Rétabli : ${cases}.`
}

export function useAnnulerRetablir({
  actif,
  refus,
  executer,
  notifier,
}: {
  /** Droit d'écriture et vue chargée. */
  actif: boolean
  /** Pourquoi pas maintenant (calcul en cours…) ; null : on peut. */
  refus: () => string | null
  /** Écriture de la vue (occupation, relecture, message d'erreur). */
  executer: (
    action: () => Promise<unknown>,
    echec: string,
  ) => Promise<{ ok: boolean } | void>
  notifier: (texte: string, ton?: 'attention') => void
}) {
  // Les rappels changent à chaque rendu : l'écouteur lit les derniers.
  const rappels = useRef({ refus, executer, notifier })
  rappels.current = { refus, executer, notifier }

  useEffect(() => {
    if (!actif) return
    const touche = (e: KeyboardEvent) => {
      const sens = sensDuRaccourci(e)
      if (!sens || e.repeat || cibleDeSaisie(e.target)) return
      if (
        document.querySelector('[role=dialog], [role=alertdialog], [role=menu]')
      )
        return
      e.preventDefault()
      const { refus: r, executer: x, notifier: n } = rappels.current
      const pasMaintenant = r()
      if (pasMaintenant) return n(pasMaintenant, 'attention')
      if (sens === 'annuler' ? !peutAnnuler() : !peutRetablir())
        return n(sens === 'annuler' ? 'Rien à annuler.' : 'Rien à rétablir.')
      let faites: number | null = null
      void Promise.resolve(
        x(
          async () => {
            faites = await (sens === 'annuler' ? annuler() : retablir())
          },
          sens === 'annuler'
            ? 'Annulation impossible'
            : 'Rétablissement impossible',
        ),
      ).then(() => {
        if (faites) n(messageAnnulation(sens, faites))
      })
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [actif])
}

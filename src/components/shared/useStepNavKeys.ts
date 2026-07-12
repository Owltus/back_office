import { useEffect } from 'react'

/**
 * Raccourcis clavier jumeaux de `StepNav`, repris du board Parking puis
 * centralisés pour que RepJour, PDJ, Rapprochement et Caisse partagent
 * EXACTEMENT le même geste :
 *   ←     pas précédent (jour / shift plus ancien)
 *   →     pas suivant (jour / shift plus récent)
 *   Alt   retour à « aujourd'hui »
 *
 * On respecte les mêmes bornes que les flèches (`prevDisabled` / `nextDisabled`,
 * les props que le board passe déjà à `StepNav`) : le clavier ne fait jamais
 * plus que le bouton. Et on ignore les frappes émises depuis un champ de saisie
 * (INPUT/TEXTAREA) — l'hôtelier qui tape ne doit pas voir la date sauter.
 */
export function useStepNavKeys({
  onPrev,
  onNext,
  onToday,
  prevDisabled = false,
  nextDisabled = false,
}: {
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  prevDisabled?: boolean
  nextDisabled?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') {
        if (!prevDisabled) onPrev()
      } else if (e.key === 'ArrowRight') {
        if (!nextDisabled) onNext()
      } else if (e.key === 'Alt' && !e.repeat) {
        // preventDefault coupe la prise de focus du menu navigateur sur Alt seul.
        e.preventDefault()
        onToday()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPrev, onNext, onToday, prevDisabled, nextDisabled])
}

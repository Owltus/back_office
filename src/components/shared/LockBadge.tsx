import { Tip } from '#/components/shared/Tip.tsx'
import { cn } from '#/lib/utils.ts'

/**
 * Pastille d'état d'une feuille : clôturée (figée) ou ouverte (saisie en cours).
 *
 * Elle dit l'état du DOCUMENT, jamais les droits du lecteur : une feuille ouverte
 * le reste sous les yeux d'un simple `utilisateur`, qui ne peut pourtant rien
 * modifier. Le bouton du bas, lui, parle des droits.
 *
 * Le libellé est passé par l'appelant : la caisse ferme une « feuille »
 * (« Clôturée »), le rapprochement ferme un « rapprochement » (« Clôturé »).
 *
 * Le mot porte le sens à lui seul ; la couleur ne fait que l'appuyer. C'est ce
 * qui la rend lisible sans distinguer l'émeraude de l'ambre.
 */
export function LockBadge({
  locked,
  label,
  hint,
}: {
  locked: boolean
  label: string
  /** Explication au survol : ce que le verrou empêche, ou ce qui se passe. */
  hint?: string
}) {
  const badge = (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        locked
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-500',
        hint && 'cursor-help',
      )}
    >
      {label}
    </span>
  )
  if (!hint) return badge
  return <Tip label={hint}>{badge}</Tip>
}

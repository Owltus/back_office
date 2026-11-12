/*
 * Compteurs « propositions » et « validés » de l'en-tête (mois et semaine),
 * toujours affichés, même à zéro, en deux pastilles séparées (« verrouillés »
 * en plus s'il y en a). Au survol (ou au clavier) d'une pastille, la grille
 * met en avant les shifts concernés et estompe le reste (décision
 * utilisateur du 2026-10-28) : l'attribut `data-planning-focus` posé sur
 * <html> est lu par `styles/planning.css`.
 */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { BadgeCheck, Lock, SquareDashed } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { cn } from '#/lib/utils.ts'

type Focus = 'propositions' | 'valides' | 'verrouilles'

const poser = (f: Focus | null) => {
  const html = document.documentElement
  if (f) html.dataset.planningFocus = f
  else delete html.dataset.planningFocus
}

function Pastille({
  focus,
  tip,
  classe,
  children,
}: {
  focus: Focus
  tip: string
  classe?: string
  children: ReactNode
}) {
  return (
    <Tip label={tip}>
      <span
        tabIndex={0}
        onMouseEnter={() => poser(focus)}
        onMouseLeave={() => poser(null)}
        onFocus={() => poser(focus)}
        onBlur={() => poser(null)}
        className={cn(
          'inline-flex cursor-default items-center gap-1 rounded-md border px-2 py-1 text-xs tabular-nums transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
          classe,
        )}
      >
        {children}
      </span>
    </Tip>
  )
}

export function CompteursValidation({
  propositions,
  valides,
  verrouilles,
}: {
  propositions: number
  valides: number
  verrouilles: number
}) {
  // Un en-tête démonté ne laisse jamais la grille estompée.
  useEffect(() => () => poser(null), [])
  return (
    <div className="flex items-center gap-1.5">
      <Pastille
        focus="propositions"
        tip="Propositions (pointillés) : proposées par le moteur, recalculées à chaque génération. Survoler pour les voir."
        classe="text-muted-foreground"
      >
        <SquareDashed className="size-3.5" />
        {propositions} proposition{propositions > 1 ? 's' : ''}
      </Pastille>
      <Pastille
        focus="valides"
        tip="Validés (coche verte) : gardés par les générations, encore modifiables à la main. Survoler pour les voir."
        classe="text-emerald-600 dark:text-emerald-400"
      >
        <BadgeCheck className="size-3.5" />
        {valides} validé{valides > 1 ? 's' : ''}
      </Pastille>
      {verrouilles > 0 && (
        <Pastille
          focus="verrouilles"
          tip="Verrouillés (cadenas) : semaines réalisées, rien ne bouge. Survoler pour les voir."
          classe="text-muted-foreground"
        >
          <Lock className="size-3" />
          {verrouilles} verrouillé{verrouilles > 1 ? 's' : ''}
        </Pastille>
      )}
    </div>
  )
}

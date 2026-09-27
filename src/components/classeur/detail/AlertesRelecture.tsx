import { useState } from 'react'
import { ChevronDown, TriangleAlert } from 'lucide-react'

import type { Alerte } from '#/lib/classeur/relecture.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Alertes de relecture sous la barre de l'éditeur (amélioration n° 18) :
 * une ligne discrète « 2 points à vérifier », dépliable ; chaque point
 * amène le curseur sur sa ligne. Rien quand tout va bien — un « tout va
 * bien » permanent serait du bruit.
 */
export function AlertesRelecture({
  alertes,
  onAller,
}: {
  alertes: readonly Alerte[]
  onAller: (ligne: number) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  if (alertes.length === 0) return null
  const n = alertes.length
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className="flex items-center gap-1.5 rounded-sm text-amber-600 hover:underline dark:text-amber-400"
      >
        <TriangleAlert className="size-3.5" />
        {n} {n > 1 ? 'points à vérifier' : 'point à vérifier'}
        <ChevronDown
          className={cn(
            'size-3.5 transition-transform',
            ouvert && 'rotate-180',
          )}
        />
      </button>
      {ouvert && (
        <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
          {alertes.map((a, i) => (
            <li key={`${String(a.ligne)}-${String(i)}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onAller(a.ligne)}
                className="w-full rounded-sm px-1 py-0.5 text-left text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <span className="tabular-nums text-foreground">
                  Ligne {a.ligne}
                </span>{' '}
                · {a.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

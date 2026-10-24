import { useState } from 'react'
import { ChevronDown, TriangleAlert } from 'lucide-react'

import type { Alerte, Correction } from '#/lib/classeur/relecture.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Alertes de relecture sous la barre de l'éditeur (amélioration n° 18) :
 * une ligne discrète « 2 points à vérifier », dépliable ; chaque point
 * amène le curseur sur sa ligne. Rien quand tout va bien — un « tout va
 * bien » permanent serait du bruit. Une alerte sur le titre ou la
 * description (quatrième mur, étape 7 du plan `classeur-echange-ia`) ouvre
 * leur dialogue (`onChamp`).
 * Un point MÉCANIQUE porte sa correction (2026-10-24) : bouton à côté du
 * point, et « Corriger les N points simples » en tête (`onCorriger`, une
 * seule modification du texte : Ctrl + Z annule tout).
 */
export function AlertesRelecture({
  alertes,
  onAller,
  onChamp,
  onCorriger,
}: {
  alertes: readonly Alerte[]
  onAller: (ligne: number) => void
  onChamp?: () => void
  onCorriger?: (corrections: readonly Correction[]) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  if (alertes.length === 0) return null
  const n = alertes.length
  const corrections = onCorriger
    ? alertes.flatMap((a) => (a.correction ? [a.correction] : []))
    : []
  return (
    <div className="text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
        {corrections.length > 0 && onCorriger && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onCorriger(corrections)}
            className="rounded-sm text-primary hover:underline"
          >
            {corrections.length > 1
              ? `Corriger les ${String(corrections.length)} points simples`
              : 'Corriger le point simple'}
          </button>
        )}
      </div>
      {ouvert && (
        <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
          {alertes.map((a, i) => (
            <li
              key={`${String(a.ligne)}-${String(i)}`}
              className="flex items-start gap-2"
            >
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  a.champ !== undefined && onChamp !== undefined
                    ? onChamp()
                    : onAller(a.ligne)
                }
                className="min-w-0 flex-1 rounded-sm px-1 py-0.5 text-left text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <span className="tabular-nums text-foreground">
                  {a.champ === 'titre'
                    ? 'Titre'
                    : a.champ === 'description'
                      ? 'Description'
                      : `Ligne ${String(a.ligne)}`}
                </span>{' '}
                · {a.message}
              </button>
              {a.correction && onCorriger && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (a.correction) onCorriger([a.correction])
                  }}
                  className="shrink-0 rounded-sm px-1 py-0.5 text-primary hover:underline"
                >
                  {a.correction.libelle}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

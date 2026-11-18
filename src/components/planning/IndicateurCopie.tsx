/*
 * Indicateur du mode copie au Ctrl (2026-11-18) : le shift en mémoire, en bas
 * de l'écran, et la mise en évidence de la case source. Rien quand la mémoire
 * est vide.
 */

import { Copy } from 'lucide-react'

import {
  libelleCopie,
  nomTouche,
  styleSource,
} from '#/components/planning/saisieRapide.ts'
import type { MemoireCopie } from '#/components/planning/hooks/useCopieCtrl.ts'

export function IndicateurCopie({
  memoire,
  touche,
  attribut,
}: {
  memoire: MemoireCopie | null
  touche: 'Meta' | 'Control'
  /** Attribut des cases de la vue (`data-case` ou `data-case-mois`). */
  attribut: string
}) {
  if (!memoire) return null
  return (
    <>
      <style>{styleSource(attribut, memoire.source)}</style>
      <div
        role="status"
        className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-popover px-4 py-2 text-sm text-popover-foreground shadow-lg"
      >
        <Copy className="size-4 text-primary" aria-hidden />
        <span>
          Shift copié{' '}
          <strong className="tabular-nums">
            {libelleCopie(memoire.copie)}
          </strong>
        </span>
        <span className="text-xs text-muted-foreground">
          · cliquez sur une case pour le coller, relâchez {nomTouche(touche)}{' '}
          pour arrêter
        </span>
      </div>
    </>
  )
}

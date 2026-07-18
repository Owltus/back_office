import { Link } from '@tanstack/react-router'
import { ShieldAlert, Sparkles } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import type { WordPool } from '#/lib/facturation/wordpool.ts'

/*
 * Card du haut du rail droit : accès aux deux vues de CURATION globale — la galaxie
 * ECharts (`/facturation/galaxie`) et la revue des anomalies (`/facturation/revue`).
 * La galaxie est désactivée tant qu'aucune donnée n'est apprise ; la revue affiche un
 * compteur d'anomalies et ne s'active que s'il y en a.
 */
export function GalaxyCard({
  pool,
  anomalyCount = 0,
}: {
  pool: WordPool
  anomalyCount?: number
}) {
  const empty = Object.values(pool.perCode).every(
    (cell) => Object.keys(cell).length === 0,
  )

  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-border bg-card p-3">
      {empty ? (
        <Button variant="outline" size="sm" className="w-full" disabled>
          <Sparkles className="size-4" />
          Prévisualisation graphique
        </Button>
      ) : (
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link to="/facturation/galaxie">
            <Sparkles className="size-4" />
            Prévisualisation graphique
          </Link>
        </Button>
      )}

      {anomalyCount > 0 ? (
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link to="/facturation/revue">
            <ShieldAlert className="size-4 text-amber-500" />
            Revue des anomalies
            <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 text-[11px] text-amber-600 tabular-nums">
              {anomalyCount}
            </span>
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" className="w-full" disabled>
          <ShieldAlert className="size-4" />
          Aucune anomalie
        </Button>
      )}
    </div>
  )
}

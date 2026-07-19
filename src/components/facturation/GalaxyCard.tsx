import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ShieldAlert, Sparkles } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import { RevueDialog } from '#/components/facturation/FacturationRevue.tsx'
import type { WordPool } from '#/lib/facturation/wordpool.ts'

/*
 * Card du haut du rail droit : accès aux deux vues de CURATION globale — la galaxie
 * ECharts (page `/facturation/galaxie`) et la revue des anomalies (modal `RevueDialog`).
 * La galaxie est désactivée tant qu'aucune donnée n'est apprise ; la revue est toujours
 * accessible (elle héberge aussi la gestion des interdictions) et affiche un compteur
 * d'anomalies quand il en reste.
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
  const [revueOpen, setRevueOpen] = useState(false)

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

      {/* Toujours accessible : la revue héberge aussi la gestion des interdictions
          (lever un ban), pas seulement les anomalies. Le badge ambre ne s'affiche
          que s'il reste des anomalies à examiner. */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setRevueOpen(true)}
      >
        <ShieldAlert
          className={anomalyCount > 0 ? 'size-4 text-amber-500' : 'size-4'}
        />
        Revue
        {anomalyCount > 0 && (
          <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 text-[11px] text-amber-600 tabular-nums">
            {anomalyCount}
          </span>
        )}
      </Button>

      <RevueDialog open={revueOpen} onOpenChange={setRevueOpen} />
    </div>
  )
}

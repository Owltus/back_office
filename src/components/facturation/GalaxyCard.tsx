import { Link } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import type { WordPool } from '#/lib/facturation/wordpool.ts'

/*
 * Card « Prévisualisation graphique » (haut du rail droit). Lien vers la page
 * pleine `/facturation/galaxie` (galaxie ECharts). Désactivée tant qu'aucune donnée
 * apprise n'est disponible (aucun mot dans les nuages).
 */
export function GalaxyCard({ pool }: { pool: WordPool }) {
  const empty = Object.values(pool.perCode).every(
    (cell) => Object.keys(cell).length === 0,
  )

  return (
    <div className="shrink-0 rounded-xl border border-border bg-card p-3">
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
    </div>
  )
}

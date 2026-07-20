import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { AnalytiqueMoisBoard } from '#/components/repjour/boards/AnalytiqueMoisBoard.tsx'

export const Route = createFileRoute('/repjour/analytique/$year/$month')({
  component: AnalytiqueMoisPage,
  head: () => ({ meta: [{ title: 'Analytique — RepJour' }] }),
})

/**
 * Détail analytique d'un mois (jour par jour), accessible à tous les rôles
 * connectés en LECTURE. Les params `$year` / `$month` (chaînes de route) sont
 * convertis en nombres pour le board.
 */
function AnalytiqueMoisPage() {
  const { year, month } = Route.useParams()
  return (
    <PageGuard page="repjour">
      <AnalytiqueMoisBoard year={Number(year)} month={Number(month)} />
    </PageGuard>
  )
}

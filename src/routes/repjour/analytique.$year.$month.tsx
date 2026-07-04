import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
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
    <ProtectedRoute allowedRoles={['utilisateur', 'super_utilisateur', 'admin']}>
      <AnalytiqueMoisBoard year={Number(year)} month={Number(month)} />
    </ProtectedRoute>
  )
}

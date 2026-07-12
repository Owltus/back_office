import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { CaisseAnalytiqueMoisBoard } from '#/components/caisse/CaisseAnalytiqueMoisBoard.tsx'

export const Route = createFileRoute('/caisse/analytique/$year/$month')({
  component: CaisseAnalytiqueDetailPage,
  head: () => ({ meta: [{ title: 'Analytique — Caisse' }] }),
})

/**
 * Détail analytique Caisse d'un mois, accessible à tous les rôles connectés en
 * LECTURE. La garde `ProtectedRoute` redirige vers /login sans session.
 */
function CaisseAnalytiqueDetailPage() {
  const { year, month } = Route.useParams()
  return (
    <ProtectedRoute allowedRoles={['utilisateur', 'super_utilisateur', 'admin']}>
      <CaisseAnalytiqueMoisBoard year={Number(year)} month={Number(month)} />
    </ProtectedRoute>
  )
}

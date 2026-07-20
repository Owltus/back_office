import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
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
    <PageGuard page="caisse">
      <CaisseAnalytiqueMoisBoard year={Number(year)} month={Number(month)} />
    </PageGuard>
  )
}

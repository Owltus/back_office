import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { PdjAnalytiqueMoisBoard } from '#/components/pdj/PdjAnalytiqueMoisBoard.tsx'

export const Route = createFileRoute('/pdj/analytique/$year/$month')({
  component: PdjAnalytiqueMoisPage,
  head: () => ({ meta: [{ title: 'Analytique — PDJ' }] }),
})

/**
 * Détail analytique PDJ d'un mois, accessible à tous les rôles connectés en
 * LECTURE. La garde `ProtectedRoute` redirige vers /login sans session. Le
 * PageContainer est fourni par le board (convention de l'onglet PDJ).
 */
function PdjAnalytiqueMoisPage() {
  const { year, month } = Route.useParams()
  return (
    <PageGuard page="pdj">
      <PdjAnalytiqueMoisBoard year={Number(year)} month={Number(month)} />
    </PageGuard>
  )
}

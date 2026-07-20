import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { ParkingAnalytiqueMoisBoard } from '#/components/parking/ParkingAnalytiqueMoisBoard.tsx'

export const Route = createFileRoute('/parking/analytique/$year/$month')({
  component: ParkingAnalytiqueDetailPage,
  head: () => ({ meta: [{ title: 'Analytique — Parking' }] }),
})

/**
 * Détail analytique d'un mois de parking, accessible à tous les rôles connectés
 * en LECTURE. La garde `ProtectedRoute` redirige vers /login sans session. Le
 * board fournit lui-même son `PageContainer` (convention de l'onglet Parking).
 */
function ParkingAnalytiqueDetailPage() {
  const { year, month } = Route.useParams()
  return (
    <PageGuard page="parking">
      <ParkingAnalytiqueMoisBoard year={Number(year)} month={Number(month)} />
    </PageGuard>
  )
}

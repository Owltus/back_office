import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { ParkingAnalytiqueBoard } from '#/components/parking/ParkingAnalytiqueBoard.tsx'

export const Route = createFileRoute('/parking/analytique/')({
  component: ParkingAnalytiqueIndexPage,
  head: () => ({ meta: [{ title: 'Analytique — Parking' }] }),
})

/**
 * Vue analytique Parking, accessible à tous les rôles connectés en LECTURE.
 * La garde `ProtectedRoute` redirige vers /login sans session.
 */
function ParkingAnalytiqueIndexPage() {
  return (
    <PageGuard page="parking">
      <ParkingAnalytiqueBoard />
    </PageGuard>
  )
}

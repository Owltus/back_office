import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { RaproMonthlyBoard } from '#/components/rapro/RaproMonthlyBoard.tsx'

export const Route = createFileRoute('/rapro/analytique/$year/$month')({
  component: RaproAnalytiqueDetailPage,
  head: () => ({ meta: [{ title: 'Analytique — Rapprochement' }] }),
})

function RaproAnalytiqueDetailPage() {
  const { year, month } = Route.useParams()
  return (
    <ProtectedRoute allowedRoles={['utilisateur', 'super_utilisateur', 'admin']}>
      <RaproMonthlyBoard year={Number(year)} month={Number(month)} />
    </ProtectedRoute>
  )
}

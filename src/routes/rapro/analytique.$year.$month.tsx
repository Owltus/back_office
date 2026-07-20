import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { RaproMonthlyBoard } from '#/components/rapro/RaproMonthlyBoard.tsx'

export const Route = createFileRoute('/rapro/analytique/$year/$month')({
  component: RaproAnalytiqueDetailPage,
  head: () => ({ meta: [{ title: 'Analytique — Rapprochement' }] }),
})

function RaproAnalytiqueDetailPage() {
  const { year, month } = Route.useParams()
  return (
    <PageGuard page="rapro">
      <RaproMonthlyBoard year={Number(year)} month={Number(month)} />
    </PageGuard>
  )
}

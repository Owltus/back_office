import { createFileRoute } from '@tanstack/react-router'

import { RaproMonthlyBoard } from '#/components/rapro/RaproMonthlyBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/rapro-mois/$year/$month')({
  component: RaproMoisDetailPage,
  head: () => ({ meta: [{ title: 'Récap ménage — Back Office' }] }),
})

function RaproMoisDetailPage() {
  const { year, month } = Route.useParams()
  return (
    <PageContainer>
      <RaproMonthlyBoard year={Number(year)} month={Number(month)} />
    </PageContainer>
  )
}

import { createFileRoute } from '@tanstack/react-router'

import { RaproMonthlyBoard } from '#/components/rapro/RaproMonthlyBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/rapro-mois')({
  component: RaproMoisPage,
  head: () => ({ meta: [{ title: 'Récap ménage — Back Office' }] }),
})

function RaproMoisPage() {
  return (
    <PageContainer>
      <RaproMonthlyBoard />
    </PageContainer>
  )
}

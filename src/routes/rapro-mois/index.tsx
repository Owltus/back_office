import { createFileRoute } from '@tanstack/react-router'

import { RaproAnalytiqueBoard } from '#/components/rapro/RaproAnalytiqueBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/rapro-mois/')({
  component: RaproMoisIndexPage,
  head: () => ({ meta: [{ title: 'Récap ménage — Back Office' }] }),
})

function RaproMoisIndexPage() {
  return (
    <PageContainer>
      <RaproAnalytiqueBoard />
    </PageContainer>
  )
}

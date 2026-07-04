import { createFileRoute } from '@tanstack/react-router'

import { ComingSoon } from '#/components/ComingSoon.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/repjour')({
  component: RepJourPage,
  head: () => ({ meta: [{ title: 'RepJour — Back Office' }] }),
})

function RepJourPage() {
  return (
    <PageContainer>
      <ComingSoon />
    </PageContainer>
  )
}

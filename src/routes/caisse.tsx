import { createFileRoute } from '@tanstack/react-router'

import { ComingSoon } from '#/components/ComingSoon.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/caisse')({
  component: CaissePage,
  head: () => ({ meta: [{ title: 'Caisse — Back Office' }] }),
})

function CaissePage() {
  return (
    <PageContainer>
      <ComingSoon />
    </PageContainer>
  )
}

import { createFileRoute } from '@tanstack/react-router'

import { ComingSoon } from '#/components/ComingSoon.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/rapro')({
  component: RaproPage,
  head: () => ({ meta: [{ title: 'Rapprochement — Back Office' }] }),
})

function RaproPage() {
  return (
    <PageContainer>
      <ComingSoon />
    </PageContainer>
  )
}

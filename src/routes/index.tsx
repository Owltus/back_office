import { createFileRoute } from '@tanstack/react-router'

import { ComingSoon } from '#/components/ComingSoon.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/')({
  component: DashboardPage,
  head: () => ({ meta: [{ title: 'Dashboard — Back Office' }] }),
})

function DashboardPage() {
  return (
    <PageContainer>
      <ComingSoon />
    </PageContainer>
  )
}

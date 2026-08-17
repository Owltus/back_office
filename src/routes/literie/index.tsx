import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { LiterieBoard } from '#/components/literie/LiterieBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/literie/')({
  component: LiteriePage,
})

function LiteriePage() {
  return (
    <PageGuard page="literie">
      <PageContainer>
        <LiterieBoard />
      </PageContainer>
    </PageGuard>
  )
}

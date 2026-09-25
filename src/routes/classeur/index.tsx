import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { ClasseurBoard } from '#/components/classeur/ClasseurBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/classeur/')({
  component: ClasseurPage,
})

function ClasseurPage() {
  return (
    <PageGuard page="classeur">
      <PageContainer>
        <ClasseurBoard />
      </PageContainer>
    </PageGuard>
  )
}

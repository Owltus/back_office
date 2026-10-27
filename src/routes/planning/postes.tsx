import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { FilMessages } from '#/components/planning/Messages.tsx'
import { PostesPage } from '#/components/planning/parametres/PostesPage.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/planning/postes')({
  component: Page,
})

function Page() {
  return (
    <PageGuard page="planning">
      <PageContainer fillHeight>
        <FilMessages>
          <PostesPage />
        </FilMessages>
      </PageContainer>
    </PageGuard>
  )
}

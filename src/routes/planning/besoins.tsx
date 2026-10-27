import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { FilMessages } from '#/components/planning/Messages.tsx'
import { BesoinsPage } from '#/components/planning/parametres/BesoinsPage.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/planning/besoins')({
  component: Page,
})

function Page() {
  return (
    <PageGuard page="planning">
      <PageContainer fillHeight>
        <FilMessages>
          <BesoinsPage />
        </FilMessages>
      </PageContainer>
    </PageGuard>
  )
}

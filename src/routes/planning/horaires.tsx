import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { FilMessages } from '#/components/planning/Messages.tsx'
import { HorairesPage } from '#/components/planning/parametres/HorairesPage.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/planning/horaires')({
  component: Page,
})

function Page() {
  return (
    <PageGuard page="planning">
      <PageContainer fillHeight>
        <FilMessages>
          <HorairesPage />
        </FilMessages>
      </PageContainer>
    </PageGuard>
  )
}

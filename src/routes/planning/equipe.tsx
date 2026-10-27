import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { FilMessages } from '#/components/planning/Messages.tsx'
import { EquipePage } from '#/components/planning/parametres/EquipePage.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/planning/equipe')({
  component: Page,
})

function Page() {
  return (
    <PageGuard page="planning">
      <PageContainer fillHeight>
        <FilMessages>
          <EquipePage />
        </FilMessages>
      </PageContainer>
    </PageGuard>
  )
}

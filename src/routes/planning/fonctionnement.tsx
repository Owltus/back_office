import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { FonctionnementPage } from '#/components/planning/parametres/FonctionnementPage.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

// Comment ça marche : lecture seule, pour qui voit la page planning.
export const Route = createFileRoute('/planning/fonctionnement')({
  component: Page,
})

function Page() {
  return (
    <PageGuard page="planning">
      <PageContainer fillHeight>
        <FonctionnementPage />
      </PageContainer>
    </PageGuard>
  )
}

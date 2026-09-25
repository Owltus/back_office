import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { ClasseurListActions } from '#/components/classeur/ClasseurListActions.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/classeur/')({
  component: ClasseurPage,
})

/**
 * Liste des classeurs. Export et import JSON sont branchés par
 * `ClasseurListActions` (bouton Importer de l'en-tête + dépôt sur la page).
 */
function ClasseurPage() {
  return (
    <PageGuard page="classeur">
      <PageContainer>
        <ClasseurListActions />
      </PageContainer>
    </PageGuard>
  )
}

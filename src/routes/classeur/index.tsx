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
 * `lg:min-h-0` : à partir de `lg`, la page tient dans la fenêtre et le
 * tableau défile en interne (comme les pages analytiques) ; en dessous, la
 * page suit son flux et défile normalement.
 */
function ClasseurPage() {
  return (
    <PageGuard page="classeur">
      <PageContainer className="lg:min-h-0">
        <ClasseurListActions />
      </PageContainer>
    </PageGuard>
  )
}

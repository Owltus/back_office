import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { ClasseurListActions } from '#/components/classeur/ClasseurListActions.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/classeur/')({
  component: ClasseurPage,
})

/**
 * Liste des classeurs. L'export JSON est branché par `ClasseurListActions`
 * (étape 5) ; l'import JSON (`onImporterJson`) le sera par l'étape 6 — sans
 * lui, la liste grise la carte d'import.
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

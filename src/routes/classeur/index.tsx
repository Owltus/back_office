import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { ClasseurList } from '#/components/classeur/ClasseurList.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/classeur/')({
  component: ClasseurPage,
})

/**
 * Liste des classeurs. Import et export JSON (`onImporterJson`,
 * `onExporterJson`) seront branchés ici par les étapes 5 et 6 ; sans eux, la
 * liste grise l'import et n'affiche pas l'export.
 */
function ClasseurPage() {
  return (
    <PageGuard page="classeur">
      <PageContainer>
        <ClasseurList />
      </PageContainer>
    </PageGuard>
  )
}

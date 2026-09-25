import { createFileRoute } from '@tanstack/react-router'

import { ClasseurDashboardActions } from '#/components/classeur/ClasseurDashboardActions.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/classeur/$classeurId/')({
  component: ClasseurDashboardPage,
})

/**
 * Tableau de bord d'un classeur. La garde `PageGuard` et la conversion de
 * l'identifiant sont faites par le layout parent (`$classeurId.tsx`), qui ne
 * rend cet `Outlet` que pour un identifiant entier.
 *
 * Sommaire, export PDF, Markdown et JSON sont branchés par
 * `ClasseurDashboardActions` (étape 5) ; l'import JSON (`onImporter`) le
 * sera par l'étape 6 — sa carte reste grisée « Bientôt disponible ».
 */
function ClasseurDashboardPage() {
  const { classeurId } = Route.useParams()
  return (
    <PageContainer>
      <ClasseurDashboardActions classeurId={Number(classeurId)} />
    </PageContainer>
  )
}

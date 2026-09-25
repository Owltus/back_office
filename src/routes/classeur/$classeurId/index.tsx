import { createFileRoute } from '@tanstack/react-router'

import { ClasseurDashboard } from '#/components/classeur/ClasseurDashboard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/classeur/$classeurId/')({
  component: ClasseurDashboardPage,
})

/**
 * Tableau de bord d'un classeur. La garde `PageGuard` et la conversion de
 * l'identifiant sont faites par le layout parent (`$classeurId.tsx`), qui ne
 * rend cet `Outlet` que pour un identifiant entier.
 *
 * Les rappels d'action (`onSommaire`, `onExporterPdf`, `onExporterMarkdown`,
 * `onExporterJson`, `onImporter`) seront branchés ici par les étapes 5 et 6 ;
 * sans eux, les cartes sont grisées « Bientôt disponible ».
 */
function ClasseurDashboardPage() {
  const { classeurId } = Route.useParams()
  return (
    <PageContainer>
      <ClasseurDashboard classeurId={Number(classeurId)} />
    </PageContainer>
  )
}

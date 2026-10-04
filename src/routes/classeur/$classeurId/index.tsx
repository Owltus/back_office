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
 * Sommaire, impression, exports, import-fusion et historique sont branchés
 * par `ClasseurDashboardActions` sur les boutons de l'en-tête.
 *
 * La rangée du classeur tient dans la hauteur du `<main>` (qui ne défile
 * plus) : l'accueil défile dans SA zone, barre au bord droit de la fenêtre.
 */
function ClasseurDashboardPage() {
  const { classeurId } = Route.useParams()
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageContainer>
        <ClasseurDashboardActions classeurId={Number(classeurId)} />
      </PageContainer>
    </div>
  )
}

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
 * par `ClasseurDashboardActions` sur les cartes de l'accueil.
 *
 * Comme la page d'un chapitre (2026-10-04) : la page tient dans la hauteur
 * du `<main>`, l'en-tête reste fixe et seule la zone du contenu défile
 * (`PageAvecEnTete`, barre au bord droit de la fenêtre).
 */
function ClasseurDashboardPage() {
  const { classeurId } = Route.useParams()
  return (
    <PageContainer fillHeight>
      <ClasseurDashboardActions classeurId={Number(classeurId)} />
    </PageContainer>
  )
}

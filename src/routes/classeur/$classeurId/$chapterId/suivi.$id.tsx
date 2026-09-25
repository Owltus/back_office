import { createFileRoute } from '@tanstack/react-router'

import { TrackingSheetDetail } from '#/components/classeur/detail/TrackingSheetDetail.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute(
  '/classeur/$classeurId/$chapterId/suivi/$id',
)({
  component: SuiviPage,
})

/** Détail d'une feuille de suivi périodique. */
function SuiviPage() {
  const { id } = Route.useParams()
  return (
    <PageContainer>
      <TrackingSheetDetail key={id} />
    </PageContainer>
  )
}

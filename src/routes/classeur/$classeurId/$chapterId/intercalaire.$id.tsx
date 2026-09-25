import { createFileRoute } from '@tanstack/react-router'

import { IntercalaireDetail } from '#/components/classeur/detail/IntercalaireDetail.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute(
  '/classeur/$classeurId/$chapterId/intercalaire/$id',
)({
  component: IntercalairePage,
})

/** Détail d'un intercalaire (page de séparation). */
function IntercalairePage() {
  const { id } = Route.useParams()
  return (
    <PageContainer>
      <IntercalaireDetail key={id} />
    </PageContainer>
  )
}

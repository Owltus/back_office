import { createFileRoute } from '@tanstack/react-router'

import { DocumentDetail } from '#/components/classeur/detail/DocumentDetail.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute(
  '/classeur/$classeurId/$chapterId/document/$id',
)({
  component: DocumentPage,
})

/** Détail d'un document Markdown (lecture, édition, exports). */
function DocumentPage() {
  const { id } = Route.useParams()
  return (
    <PageContainer>
      <DocumentDetail key={id} />
    </PageContainer>
  )
}

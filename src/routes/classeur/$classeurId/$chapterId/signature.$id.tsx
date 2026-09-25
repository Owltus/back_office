import { createFileRoute } from '@tanstack/react-router'

import { SignatureSheetDetail } from '#/components/classeur/detail/SignatureSheetDetail.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute(
  '/classeur/$classeurId/$chapterId/signature/$id',
)({
  component: SignaturePage,
})

/** Détail d'une feuille de signature (émargement). */
function SignaturePage() {
  const { id } = Route.useParams()
  return (
    <PageContainer>
      <SignatureSheetDetail key={id} />
    </PageContainer>
  )
}

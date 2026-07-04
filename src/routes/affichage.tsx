import { createFileRoute } from '@tanstack/react-router'

import { AffichageBoard } from '#/components/affiche/AffichageBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/affichage')({
  component: AffichagePage,
  head: () => ({ meta: [{ title: 'Affichage — Back Office' }] }),
})

function AffichagePage() {
  return (
    <PageContainer printBleed fillHeight>
      <AffichageBoard />
    </PageContainer>
  )
}

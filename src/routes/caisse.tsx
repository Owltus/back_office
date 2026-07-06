import { createFileRoute } from '@tanstack/react-router'

import { CaisseBoard } from '#/components/caisse/CaisseBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/caisse')({
  component: CaissePage,
  head: () => ({ meta: [{ title: 'Caisse — Back Office' }] }),
})

function CaissePage() {
  return (
    <PageContainer printBleed>
      <CaisseBoard />
    </PageContainer>
  )
}

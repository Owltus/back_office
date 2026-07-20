import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { CaisseBoard } from '#/components/caisse/CaisseBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { parseDateSearch } from '#/lib/shared/searchParams.ts'

export const Route = createFileRoute('/caisse/')({
  component: CaissePage,
  validateSearch: parseDateSearch,
})

function CaissePage() {
  const { date } = Route.useSearch()
  return (
    <PageGuard page="caisse">
      <PageContainer printBleed>
        <CaisseBoard initialDate={date} />
      </PageContainer>
    </PageGuard>
  )
}

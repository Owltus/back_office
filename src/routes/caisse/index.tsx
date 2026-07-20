import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { CaisseBoard } from '#/components/caisse/CaisseBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/caisse/')({
  component: CaissePage,
  validateSearch: (search: Record<string, unknown>): { date?: string } => {
    const d = search.date
    return typeof d === 'string' ? { date: d } : {}
  },
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

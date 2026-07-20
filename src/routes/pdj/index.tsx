import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { BreakfastBoard } from '#/components/pdj/BreakfastBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/pdj/')({
  component: PdjPage,
  validateSearch: (search: Record<string, unknown>): { date?: string } => {
    const d = search.date
    return typeof d === 'string' ? { date: d } : {}
  },
})

function PdjPage() {
  const { date } = Route.useSearch()
  return (
    <PageGuard page="pdj">
      <PageContainer printBleed>
        <BreakfastBoard initialDate={date} />
      </PageContainer>
    </PageGuard>
  )
}

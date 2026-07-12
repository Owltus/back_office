import { createFileRoute } from '@tanstack/react-router'

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
    <PageContainer printBleed>
      <BreakfastBoard initialDate={date} />
    </PageContainer>
  )
}

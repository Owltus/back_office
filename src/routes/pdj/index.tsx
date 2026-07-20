import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { BreakfastBoard } from '#/components/pdj/BreakfastBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { parseDateSearch } from '#/lib/shared/searchParams.ts'

export const Route = createFileRoute('/pdj/')({
  component: PdjPage,
  validateSearch: parseDateSearch,
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

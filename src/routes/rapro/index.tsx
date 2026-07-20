import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { RaproBoard } from '#/components/rapro/RaproBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/rapro/')({
  component: RaproPage,
  validateSearch: (search: Record<string, unknown>): { date?: string } => {
    const d = search.date
    return typeof d === 'string' ? { date: d } : {}
  },
})

function RaproPage() {
  const { date } = Route.useSearch()
  return (
    <PageGuard page="rapro">
      <PageContainer>
        <RaproBoard initialDate={date} />
      </PageContainer>
    </PageGuard>
  )
}

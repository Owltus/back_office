import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { RaproBoard } from '#/components/rapro/RaproBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { parseDateSearch } from '#/lib/shared/searchParams.ts'

export const Route = createFileRoute('/rapro/')({
  component: RaproPage,
  validateSearch: parseDateSearch,
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

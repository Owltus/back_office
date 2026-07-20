import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { ParkingBoard } from '#/components/parking/ParkingBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/parking/')({
  component: ParkingPage,
  validateSearch: (search: Record<string, unknown>): { date?: string } => {
    const d = search.date
    return typeof d === 'string' ? { date: d } : {}
  },
})

function ParkingPage() {
  const { date } = Route.useSearch()
  return (
    <PageGuard page="parking">
      <PageContainer>
        <ParkingBoard initialDate={date} />
      </PageContainer>
    </PageGuard>
  )
}

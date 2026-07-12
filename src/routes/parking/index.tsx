import { createFileRoute } from '@tanstack/react-router'

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
    <PageContainer>
      <ParkingBoard initialDate={date} />
    </PageContainer>
  )
}

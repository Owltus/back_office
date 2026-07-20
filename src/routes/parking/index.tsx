import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { ParkingBoard } from '#/components/parking/ParkingBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { parseDateSearch } from '#/lib/shared/searchParams.ts'

export const Route = createFileRoute('/parking/')({
  component: ParkingPage,
  // Valide le FORMAT, pas seulement le type : `?date=lol` propageait un NaN
  // jusqu'aux offsets de la grille (ParkingBoard.tsx:335-336).
  validateSearch: parseDateSearch,
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

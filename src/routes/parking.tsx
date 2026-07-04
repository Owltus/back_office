import { createFileRoute } from '@tanstack/react-router'

import { ParkingBoard } from '#/components/parking/ParkingBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/parking')({
  component: ParkingPage,
  head: () => ({ meta: [{ title: 'Parking — Back Office' }] }),
})

function ParkingPage() {
  return (
    <PageContainer>
      <ParkingBoard />
    </PageContainer>
  )
}

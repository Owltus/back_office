import { createFileRoute } from '@tanstack/react-router'

import { ParkingBoard } from '#/components/parking/ParkingBoard.tsx'

export const Route = createFileRoute('/parking')({ component: ParkingPage })

function ParkingPage() {
  return (
    <div className="flex flex-1 flex-col p-4 md:p-6">
      <ParkingBoard />
    </div>
  )
}

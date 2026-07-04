import { createFileRoute } from '@tanstack/react-router'

import { BreakfastBoard } from '#/components/pdj/BreakfastBoard.tsx'

export const Route = createFileRoute('/pdj')({ component: PdjPage })

function PdjPage() {
  return (
    <div className="flex flex-1 flex-col p-4 md:p-6 print:p-0">
      <BreakfastBoard />
    </div>
  )
}

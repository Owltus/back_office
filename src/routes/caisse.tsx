import { createFileRoute } from '@tanstack/react-router'

import { ComingSoon } from '#/components/ComingSoon.tsx'

export const Route = createFileRoute('/caisse')({ component: CaissePage })

function CaissePage() {
  return (
    <div className="flex flex-1 flex-col p-4 md:p-6">
      <ComingSoon />
    </div>
  )
}

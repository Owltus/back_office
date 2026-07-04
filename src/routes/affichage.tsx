import { createFileRoute } from '@tanstack/react-router'

import { AffichageBoard } from '#/components/affiche/AffichageBoard.tsx'

export const Route = createFileRoute('/affichage')({ component: AffichagePage })

function AffichagePage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6 print:p-0">
      <AffichageBoard />
    </div>
  )
}

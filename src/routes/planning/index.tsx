import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { FilMessages } from '#/components/planning/Messages.tsx'
import { PlanningBoard } from '#/components/planning/PlanningBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { lirePlanningSearch } from '#/lib/planning/recherche.ts'

export const Route = createFileRoute('/planning/')({
  component: PlanningPage,
  validateSearch: lirePlanningSearch,
})

function PlanningPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <PageGuard page="planning">
      {/* Pleine largeur comme le Parking ; la grille défile en interne. */}
      <PageContainer fillHeight>
        <FilMessages>
          <PlanningBoard
            search={search}
            onSearch={(s) => void navigate({ search: s, replace: true })}
          />
        </FilMessages>
      </PageContainer>
    </PageGuard>
  )
}

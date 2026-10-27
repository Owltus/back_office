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
            onSearch={(s) =>
              // Changer de vue (mois ↔ semaine) ajoute une étape à
              // l'historique : le retour arrière ramène au mois d'où l'on
              // vient. Avancer d'un mois ou d'une semaine la remplace.
              void navigate({
                search: s,
                replace: (s.vue ?? 'mois') === (search.vue ?? 'mois'),
              })
            }
          />
        </FilMessages>
      </PageContainer>
    </PageGuard>
  )
}

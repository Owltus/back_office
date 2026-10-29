import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { FilMessages } from '#/components/planning/Messages.tsx'
import { HorairesPage } from '#/components/planning/parametres/HorairesPage.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { lireReglagesSearch } from '#/lib/planning/recherche.ts'

export const Route = createFileRoute('/planning/horaires')({
  component: Page,
  // `?ouvrir=` : réglage à ouvrir (lien d'un point « À vérifier »).
  validateSearch: lireReglagesSearch,
})

function Page() {
  const { ouvrir } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <PageGuard page="planning">
      <PageContainer fillHeight>
        <FilMessages>
          <HorairesPage
            ouvrir={ouvrir}
            onOuvert={() => void navigate({ search: {}, replace: true })}
          />
        </FilMessages>
      </PageContainer>
    </PageGuard>
  )
}

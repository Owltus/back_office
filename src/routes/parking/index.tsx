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
      {/* `fillHeight` (min-h-0) : sans effet en soi (une seule colonne flex-1
          dans <main>, déjà bornée) — NÉCESSAIRE pour que le conteneur de
          hauteur variable de ParkingBoard (écran tactile) puisse recevoir
          une hauteur réellement bornée plutôt que de faire défiler <main>
          entier. Sans danger pour le bureau, qui n'active pas ce mode. */}
      <PageContainer fillHeight>
        <ParkingBoard initialDate={date} />
      </PageContainer>
    </PageGuard>
  )
}

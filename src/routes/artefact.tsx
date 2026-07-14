import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { ArtefactBoard } from '#/components/artefact/ArtefactBoard.tsx'

/**
 * Route `/artefact` — REGISTRE des éléments d'interface retenus (trace de ce qui
 * a été conçu). Réservée aux ADMINS (garde `ProtectedRoute`, comme /comptes) : le
 * lien Navbar n'apparaît que pour eux et l'accès direct par URL redirige les
 * autres. `ssr: false` : la maquette est 100 % navigateur (iframe srcDoc).
 */
export const Route = createFileRoute('/artefact')({
  component: ArtefactPage,
  ssr: false,
  head: () => ({ meta: [{ title: 'Artefact — Back Office' }] }),
})

function ArtefactPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <ArtefactBoard />
    </ProtectedRoute>
  )
}

import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { ArtefactBoard } from '#/components/artefact/ArtefactBoard.tsx'

/**
 * Route TEMPORAIRE `/artefact` — galerie de propositions de cartes de synthèse
 * (repli au service d'artefacts en ligne). Réservée aux ADMINS (garde
 * `ProtectedRoute`, comme /comptes) : le lien Navbar n'apparaît que pour eux et
 * l'accès direct par URL redirige les autres. `ssr: false` : la maquette est
 * 100 % navigateur (iframe srcDoc + script client). À supprimer une fois la
 * direction de carte retenue.
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

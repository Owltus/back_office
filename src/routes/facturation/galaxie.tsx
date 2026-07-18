import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { FacturationGalaxie } from '#/components/facturation/FacturationGalaxie.tsx'

/**
 * Route `/facturation/galaxie` — page pleine de la « galaxie » des imputations
 * (graphe ECharts émetteurs → imputations → mots). Admin-only, `ssr: false`
 * (ECharts est client-only). Lecture seule du modèle appris.
 */
export const Route = createFileRoute('/facturation/galaxie')({
  component: GalaxiePage,
  ssr: false,
  head: () => ({ meta: [{ title: 'Galaxie — Facturation' }] }),
})

function GalaxiePage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <FacturationGalaxie />
    </ProtectedRoute>
  )
}

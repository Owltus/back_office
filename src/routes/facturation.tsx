import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { FacturationBoard } from '#/components/facturation/FacturationBoard.tsx'

/**
 * Route `/facturation` — PROTOTYPE de suivi/tamponnage des factures. Réservée aux
 * ADMINS (garde `ProtectedRoute`, comme /artefact) : le lien Navbar n'apparaît que
 * pour eux et l'accès direct par URL redirige les autres. `ssr: false` : lecture
 * PDF, OCR et pdf-lib sont 100 % navigateur. Aucune écriture Supabase — page de
 * test dont les seules données persistées sont les « règles apprises » (localStorage).
 */
export const Route = createFileRoute('/facturation')({
  component: FacturationPage,
  ssr: false,
  head: () => ({ meta: [{ title: 'Facturation — Back Office' }] }),
})

function FacturationPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <FacturationBoard />
    </ProtectedRoute>
  )
}

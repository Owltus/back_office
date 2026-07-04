import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { ComptesBoard } from '#/components/repjour/boards/ComptesBoard.tsx'

export const Route = createFileRoute('/repjour/comptes')({
  component: RepjourComptesPage,
  head: () => ({ meta: [{ title: 'Comptes — RepJour' }] }),
})

/**
 * Page de gestion des comptes — RÉSERVÉE à l'admin (gating strict, décision de
 * l'étape 10). Écritures : signUp via un second client Supabase, insert/update
 * `profiles`, et changement de mot de passe via la RPC serveur
 * `admin_update_password` (consommée). La garde `ProtectedRoute` gère le gating
 * ergonomique ; la RLS Supabase reste la barrière de sécurité réelle.
 */
function RepjourComptesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <ComptesBoard />
    </ProtectedRoute>
  )
}

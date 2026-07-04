import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { ImportBoard } from '#/components/repjour/boards/ImportBoard.tsx'

export const Route = createFileRoute('/repjour/import')({
  component: RepjourImportPage,
  head: () => ({ meta: [{ title: 'Import — RepJour' }] }),
})

/**
 * Page d'import CSV du PMS — réservée aux rôles `super_utilisateur` et `admin`.
 * C'est la première page en ÉCRITURE de l'îlot `/repjour` (upserts idempotents
 * dans `daily_reports`/`forecast_days` + archivage Storage). La garde
 * `ProtectedRoute` gère le gating ergonomique ; la RLS Supabase reste la
 * barrière de sécurité réelle.
 */
function RepjourImportPage() {
  return (
    <ProtectedRoute allowedRoles={['super_utilisateur', 'admin']}>
      <ImportBoard />
    </ProtectedRoute>
  )
}

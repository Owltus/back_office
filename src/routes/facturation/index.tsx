import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { FacturationBoard } from '#/components/facturation/FacturationBoard.tsx'

/**
 * Route `/facturation` — atelier de suivi/tamponnage des factures. Réservée aux
 * ADMINS (garde `PageGuard`). `ssr: false` : lecture PDF, OCR et pdf-lib sont
 * 100 % navigateur. Données serveur : référentiel des imputations (couple code + compte),
 * nuages de mots, dictionnaire d'émetteurs et journal (tables facturation_*). Vue
 * graphique sur `/facturation/galaxie`.
 */
export const Route = createFileRoute('/facturation/')({
  component: FacturationPage,
  ssr: false,
  head: () => ({ meta: [{ title: 'Facturation — Back Office' }] }),
})

function FacturationPage() {
  return (
    <PageGuard page="facturation">
      <FacturationBoard />
    </PageGuard>
  )
}

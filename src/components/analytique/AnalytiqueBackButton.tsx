import { useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'

/*
 * Bouton retour des détails mensuels analytique : revient à la vue précédente
 * (récap annuel) via l'historique du routeur. Le détail Rapro le compose à côté de
 * son bouton d'export PDF.
 */
export function AnalytiqueBackButton() {
  const router = useRouter()
  return (
    <Tip label="Retour à l'analytique">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => router.history.back()}
        aria-label="Retour à l'analytique"
      >
        <ArrowLeft />
      </Button>
    </Tip>
  )
}

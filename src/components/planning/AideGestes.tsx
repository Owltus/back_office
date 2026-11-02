/*
 * Bouton « ? » du planning (vues mois et semaine), comme l'aide des autres
 * pages (RepJour, Petit déjeuner, Parking, Rapprochement) : il ouvre une
 * fenêtre qui explique les gestes de la vue, puis tout le fonctionnement de
 * l'application (`AidePlanningContenu`). Demande utilisateur du 2026-11-02 :
 * l'explication quitte les paramètres pour ce bouton.
 */
import { useState } from 'react'

import { AidePlanningContenu } from '#/components/planning/AidePlanningContenu.tsx'
import { HelpDialogHeader } from '#/components/shared/HelpDialogHeader.tsx'
import { HelpGlyph } from '#/components/shared/HelpGlyph.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Dialog, DialogContent } from '#/components/ui/dialog.tsx'

/** Ce que disent les points et pastilles sous chaque jour. */
export const AIDE_POINTS = [
  'Sous chaque jour : l’accueil du matin, du soir et de la nuit.',
  'Vert : au complet. Rouge : il manque quelqu’un. Bleu : quelqu’un en plus. Orange : personne de demandé.',
  'Journée étoile : un horaire de 7 h, une fois par semaine pour les 39 h.',
]

export function AideGestes({ lignes }: { lignes: readonly string[] }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <>
      <Tip label="Comment ça marche">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setOuvert(true)}
          aria-label="Comment ça marche"
        >
          <HelpGlyph />
        </Button>
      </Tip>
      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-4xl">
          <HelpDialogHeader
            icon={<HelpGlyph />}
            title="Comment fonctionne le planning"
            description="Les gestes, les cases, les règles et le calcul, expliqués."
          />
          {/* Seul le corps défile : l'en-tête reste en haut. */}
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <AidePlanningContenu gestes={[...lignes, ...AIDE_POINTS]} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

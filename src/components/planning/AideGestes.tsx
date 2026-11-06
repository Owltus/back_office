/*
 * Bouton « ? » du planning (vues mois et semaine), comme l'aide des autres
 * pages (RepJour, Petit déjeuner, Parking, Rapprochement) : il ouvre une
 * fenêtre qui explique les gestes de la vue, puis tout le fonctionnement de
 * l'application (`AidePlanningContenu`). Demande utilisateur du 2026-11-02 :
 * l'explication quitte les paramètres pour ce bouton.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { AidePlanningContenu } from '#/components/planning/AidePlanningContenu.tsx'
import { planningKeys } from '#/lib/planning/keys.ts'
import { lireRegles } from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { heuresLisibles } from '#/lib/planning/temps.ts'
import type { Referentiel } from '#/lib/planning/types.ts'
import { HelpDialogHeader } from '#/components/shared/HelpDialogHeader.tsx'
import { HelpGlyph } from '#/components/shared/HelpGlyph.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Dialog, DialogContent } from '#/components/ui/dialog.tsx'

/** Ce que disent les points et pastilles sous chaque jour. La journée
 * étoile suit les journées des contrats (règles de l'établissement). */
export function aidePoints(regles: RegleEtablissement): string[] {
  const avecEtoile = regles.contrats.journees.filter(
    (j) => j.courtesMax > 0 && j.durees.length > 1,
  )
  return [
    'Sous chaque jour : l’accueil du matin, du soir et de la nuit.',
    'Vert : au complet. Rouge : il manque quelqu’un. Bleu : quelqu’un en plus. Orange : personne de demandé.',
    ...avecEtoile.map(
      (j) =>
        `Journée étoile : un horaire de ${heuresLisibles(Math.min(...j.durees))}, ${j.courtesMax > 1 ? `${j.courtesMax} fois` : 'une fois'} par semaine pour les ${heuresLisibles(j.minutesHebdo)}.`,
    ),
  ]
}

/** Le corps de la fenêtre, monté à l'ouverture : les règles viennent du
 * référentiel déjà lu par la vue (cache, aucune lecture de plus). */
function Contenu({ lignes }: { lignes: readonly string[] }) {
  const qc = useQueryClient()
  const regles = lireRegles(
    qc.getQueryData<Referentiel>(planningKeys.referentiel()),
  )
  return (
    <AidePlanningContenu
      gestes={[...lignes, ...aidePoints(regles)]}
      regles={regles}
      postes={
        qc
          .getQueryData<Referentiel>(planningKeys.referentiel())
          ?.postes.filter((p) => !p.ferme) ?? []
      }
      horaires={
        qc.getQueryData<Referentiel>(planningKeys.referentiel())?.horaires ?? []
      }
    />
  )
}

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
            <Contenu lignes={lignes} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

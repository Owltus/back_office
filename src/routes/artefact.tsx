import { createFileRoute } from '@tanstack/react-router'

import { ArtefactBoard } from '#/components/artefact/ArtefactBoard.tsx'

/**
 * Route TEMPORAIRE `/artefact` — galerie de propositions de cartes de synthèse
 * (repli au service d'artefacts en ligne). `ssr: false` : la maquette est 100 %
 * navigateur (iframe srcDoc + script client). À supprimer une fois la direction
 * de carte retenue.
 */
export const Route = createFileRoute('/artefact')({
  component: ArtefactBoard,
  ssr: false,
  head: () => ({ meta: [{ title: 'Artefact — Back Office' }] }),
})

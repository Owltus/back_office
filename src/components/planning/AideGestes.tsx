/*
 * Bouton « ? » du planning (audit RH du 2026-11-01) : l'aide s'ouvre au
 * clic (et au doigt), plus seulement au survol.
 */
import { CircleHelp } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover.tsx'

/** Ce que disent les points et pastilles sous chaque jour. */
export const AIDE_POINTS = [
  'Sous chaque jour : l’accueil du matin, du soir et de la nuit.',
  'Vert : au complet. Rouge : il manque quelqu’un. Bleu : quelqu’un en plus. Orange : personne de demandé.',
  'Journée étoile : un horaire de 7 h, une fois par semaine pour les 39 h.',
]

export function AideGestes({
  lignes,
  titre = 'Comment ça marche',
}: {
  lignes: readonly string[]
  titre?: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Aide">
          <CircleHelp />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80" aria-label={titre}>
        <p className="mb-2 text-sm font-semibold">{titre}</p>
        <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          {[...lignes, ...AIDE_POINTS].map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

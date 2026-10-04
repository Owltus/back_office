import { ChevronDown, Minus, Plus } from 'lucide-react'

import { IconAction } from '#/components/classeur/IconAction.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import {
  ECHELLE_MAX,
  ECHELLE_MIN,
  PALIERS_MENU,
  libelleZoom,
  pourcentage,
} from '#/lib/classeur/zoom.ts'
import type { ModeZoom } from '#/lib/classeur/zoom.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Contrôle de zoom de l'aperçu A4 (étape 8) : « − » · libellé ▾ · « + »,
 * comme Word, Google Docs et Acrobat. Le libellé ouvre un menu : Ajuster à
 * la largeur, Page entière, puis les pourcentages de 50 à 200 %.
 *
 * Purement présentationnel : l'état et les gestes (Ctrl + molette, Ctrl +
 * 0 / « + » / « − ») vivent dans `useZoomApercu`.
 *
 * Cibles : 32 px à la souris, 44 px au doigt (D29, `pointer-coarse:`).
 */

/** Valeur du groupe radio : `ajuster`, `page` ou l'échelle en texte. */
function valeurMode(mode: ModeZoom): string {
  return typeof mode === 'number' ? String(mode) : mode
}

function modeDeValeur(valeur: string): ModeZoom {
  if (valeur === 'ajuster' || valeur === 'page') return valeur
  return Number(valeur)
}

const CIBLE = 'pointer-coarse:size-11'

export function ZoomApercu({
  mode,
  echelle,
  onMode,
  onZoomer,
  className,
}: {
  mode: ModeZoom
  /** Échelle effective : sert aux bornes des boutons et à l'infobulle. */
  echelle: number
  onMode: (mode: ModeZoom) => void
  onZoomer: (direction: 1 | -1) => void
  className?: string
}) {
  const libelle = libelleZoom(mode)
  return (
    <ButtonGroup
      className={cn('rounded-md bg-background shadow-md', className)}
    >
      <IconAction
        label="Réduire l'aperçu"
        icon={<Minus />}
        className={CIBLE}
        disabled={echelle <= ECHELLE_MIN}
        onClick={() => onZoomer(-1)}
      />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Zoom de l'aperçu : ${libelle}${
              typeof mode === 'number' ? '' : ` (${pourcentage(echelle)})`
            }`}
            className="min-w-[6.5rem] justify-between gap-1 px-2.5 text-xs tabular-nums pointer-coarse:h-11"
          >
            {libelle}
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="min-w-44">
          <DropdownMenuRadioGroup
            value={valeurMode(mode)}
            onValueChange={(v) => onMode(modeDeValeur(v))}
          >
            <DropdownMenuRadioItem value="ajuster">
              Ajuster à la largeur
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="page">
              Page entière
            </DropdownMenuRadioItem>
            <DropdownMenuSeparator />
            {PALIERS_MENU.map((p) => (
              <DropdownMenuRadioItem
                key={p}
                value={String(p)}
                className="tabular-nums"
              >
                {pourcentage(p)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <IconAction
        label="Agrandir l'aperçu"
        icon={<Plus />}
        className={CIBLE}
        disabled={echelle >= ECHELLE_MAX}
        onClick={() => onZoomer(1)}
      />
    </ButtonGroup>
  )
}

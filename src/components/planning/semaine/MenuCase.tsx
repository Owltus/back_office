/*
 * Menu du clic droit sur une case (prototype `MenuCase.tsx`) : les horaires
 * possibles pour changer d'un clic, valider le shift, la journée étoile. Le
 * positionnement au curseur et la fermeture (Échap, clic ailleurs) sont ceux
 * du `ContextMenu` de shadcn.
 */

import { BadgeCheck, Check, Eraser, Star, Undo2 } from 'lucide-react'

import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from '#/components/ui/context-menu.tsx'
import { heures } from '#/lib/planning/affichage.ts'
import { heureAffichee } from '#/lib/planning/temps.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type { Horaire } from '#/lib/planning/types.ts'
import { travailCode } from '#/components/planning/semaine/edition.ts'

export interface OuvertureMenu {
  salarie_id: number
  jour: number
  nom: string
  /** Code horaire actuel du shift de la case. */
  actuel: number | null | undefined
  proposes: Horaire[]
  posteId: number | undefined
  validation?: { active: boolean; onBasculer: () => void }
  etoile?: { active: boolean; onBasculer: () => void }
  /** La case a un shift : la remettre à « Non attribué ». */
  vider?: () => void
}

export function MenuCase({
  ouverture,
  onHoraire,
}: {
  ouverture: OuvertureMenu | null
  onHoraire: (h: Horaire, posteId: number) => void
}) {
  if (!ouverture) return null
  const { proposes, actuel, posteId, validation, etoile, vider } = ouverture
  return (
    <ContextMenuContent className="min-w-64">
      <ContextMenuLabel className="text-xs text-muted-foreground">
        {ouverture.nom} · {JOURS[ouverture.jour]}
      </ContextMenuLabel>
      {proposes.length === 0 && (
        <ContextMenuItem disabled>
          Aucun horaire prévu pour ce poste
        </ContextMenuItem>
      )}
      {proposes.map((h) => (
        <ContextMenuItem
          key={h.id}
          onSelect={() => {
            if (actuel !== h.id && posteId !== undefined) onHoraire(h, posteId)
          }}
        >
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: h.couleur }}
          />
          <span className="font-medium">{h.nom}</span>
          <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">
            {heureAffichee(h.debut)}-{heureAffichee(h.fin)} ·{' '}
            {heures(travailCode(h))}
          </span>
          {actuel === h.id ? (
            <Check
              className="size-3.5 text-primary"
              aria-label="Horaire actuel"
            />
          ) : (
            <span className="size-3.5" />
          )}
        </ContextMenuItem>
      ))}
      {vider && (
        <ContextMenuItem onSelect={vider}>
          <Eraser />
          <span className="font-medium">Non attribué</span>
          <span className="ml-auto pl-3 text-xs text-muted-foreground">
            vider la case
          </span>
        </ContextMenuItem>
      )}
      {validation && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={validation.onBasculer}>
            {validation.active ? (
              <Undo2 />
            ) : (
              <BadgeCheck className="text-emerald-500" />
            )}
            <span className="font-medium">
              {validation.active
                ? 'Remettre en proposition'
                : 'Valider ce shift'}
            </span>
            <span className="ml-auto pl-3 text-xs text-muted-foreground">
              {validation.active ? 'recalculable' : 'gardé par les générations'}
            </span>
          </ContextMenuItem>
        </>
      )}
      {etoile && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={etoile.onBasculer}>
            <Star className="fill-amber-400 text-amber-400" />
            <span className="font-medium">Journée étoile</span>
            <span className="ml-auto pl-3 text-xs text-muted-foreground">
              {etoile.active ? 'retirer' : 'mettre ce jour'}
            </span>
            {etoile.active ? (
              <Check className="size-3.5 text-primary" />
            ) : (
              <span className="size-3.5" />
            )}
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  )
}

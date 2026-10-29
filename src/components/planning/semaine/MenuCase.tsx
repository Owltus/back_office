/*
 * Menu du clic droit sur une case (prototype `MenuCase.tsx`) : les horaires
 * possibles pour changer d'un clic, valider le shift, la journée étoile. Le
 * positionnement au curseur et la fermeture (Échap, clic ailleurs) sont ceux
 * du `ContextMenu` de shadcn.
 */

import { BadgeCheck, Check, Eraser, Star, Undo2 } from 'lucide-react'

import {
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from '#/components/ui/context-menu.tsx'
import {
  grouperHoraires,
  heures,
  ROUGE_CODE,
  texteSur,
} from '#/lib/planning/affichage.ts'
import type { CodesPermis } from '#/lib/planning/eligibilite.ts'
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
  /** Codes permis (règle unique), et pourquoi s'il n'y en a pas. */
  permis: CodesPermis<Horaire>
  /** Code actuel qui n'est plus permis ici : montré grisé, marqué actuel. */
  actuelNonPermis?: { horaire: Horaire; texte: string } | null
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
  const { permis, actuel, posteId, validation, etoile, vider } = ouverture
  const proposes = permis.codes
  const horsPermis = ouverture.actuelNonPermis ?? null
  // Le code actuel non permis a sa propre ligne : pas de doublon parmi les
  // codes écartés pour la coupure.
  const ecartes = permis.ecartes.filter(
    (e) => e.horaire.id !== horsPermis?.horaire.id,
  )
  return (
    <ContextMenuContent className="min-w-64">
      <ContextMenuLabel className="text-xs text-muted-foreground">
        {ouverture.nom} · {JOURS[ouverture.jour]}
      </ContextMenuLabel>
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
          {vider && <ContextMenuSeparator />}
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
      <ContextMenuSeparator />
      {horsPermis && (
        <ContextMenuItem
          disabled
          aria-label={`${horsPermis.horaire.code}, actuel, ${horsPermis.texte}`}
        >
          <span className="min-w-12 shrink-0 rounded border px-1.5 py-0.5 text-center text-xs font-semibold">
            {horsPermis.horaire.code}
          </span>
          <span className="flex-1 pl-1 text-xs">
            actuel · {horsPermis.texte}
          </span>
        </ContextMenuItem>
      )}
      {permis.texte && !permis.ecartes.length && !horsPermis && (
        <ContextMenuItem disabled>{permis.texte}</ContextMenuItem>
      )}
      {grouperHoraires(proposes).map((g, i) => (
        <ContextMenuGroup key={g.libelle} aria-label={g.libelle}>
          {i > 0 && <ContextMenuSeparator />}
          <ContextMenuLabel className="pt-1 pb-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {g.libelle}
          </ContextMenuLabel>
          {g.horaires.map((h) => (
            <ContextMenuItem
              key={h.id}
              aria-label={`${h.code}, ${h.nom}`}
              onSelect={() => {
                if (actuel !== h.id && posteId !== undefined)
                  onHoraire(h, posteId)
              }}
            >
              <span
                className="min-w-12 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-semibold"
                style={{
                  background: h.couleur,
                  color: h.code_rouge ? ROUGE_CODE : texteSur(h.couleur),
                }}
              >
                {h.code}
              </span>
              <span className="flex-1 pl-1 text-sm tabular-nums">
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
        </ContextMenuGroup>
      ))}
      {ecartes.length > 0 && proposes.length > 0 && <ContextMenuSeparator />}
      {ecartes.map((e) => (
        <ContextMenuItem
          key={e.horaire.id}
          disabled
          aria-label={`${e.horaire.code}, ${e.texte}`}
        >
          <span className="min-w-12 shrink-0 rounded border px-1.5 py-0.5 text-center text-xs font-semibold">
            {e.horaire.code}
          </span>
          <span className="flex-1 pl-1 text-xs">{e.texte}</span>
        </ContextMenuItem>
      ))}
    </ContextMenuContent>
  )
}

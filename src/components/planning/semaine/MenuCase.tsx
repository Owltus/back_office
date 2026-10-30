/*
 * Menu du clic droit sur une case (prototype `MenuCase.tsx`) : tous les
 * horaires que la personne peut faire sur ses postes, chacun une seule fois,
 * rangés par moment, posés d'un clic sur le poste déduit (jamais affiché :
 * code et horaires seulement) ;
 * valider le shift, la journée étoile. Le
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
  heures,
  grouperHoraires,
  ROUGE_CODE,
  texteSur,
} from '#/lib/planning/affichage.ts'
import { nomLigneCode } from '#/components/planning/codesCase.ts'
import type { CodesUniquesCase } from '#/components/planning/codesCase.ts'
import { heureAffichee } from '#/lib/planning/temps.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type { Horaire } from '#/lib/planning/types.ts'
import { travailCode } from '#/components/planning/semaine/edition.ts'

export interface OuvertureMenu {
  salarie_id: number
  jour: number
  nom: string
  /** Code horaire actuel du shift de la case, et son poste. */
  actuel: number | null | undefined
  actuelPoste?: number
  /** Codes permis, chacun une fois avec son poste déduit (règle unique par
   * poste), et pourquoi s'il n'y en a pas ; le code actuel qui n'est plus
   * permis est montré grisé. */
  codes: CodesUniquesCase
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
  const { codes, actuel, actuelPoste, validation, etoile, vider } = ouverture
  const horsPermis = codes.actuel
  const parId = new Map(codes.codes.map((c) => [c.horaire.id, c]))
  return (
    <ContextMenuContent className="min-w-80">
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
      {grouperHoraires(codes.codes.map((c) => c.horaire)).map((g, i) => (
        <ContextMenuGroup key={g.libelle} aria-label={g.libelle}>
          {i > 0 && <ContextMenuSeparator />}
          <ContextMenuLabel className="pt-1 pb-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {g.libelle}
          </ContextMenuLabel>
          {g.horaires.map((h) => {
            const c = parId.get(h.id)!
            const estActuel = actuel === h.id && actuelPoste === c.poste.id
            return (
              <ContextMenuItem
                key={h.id}
                aria-label={nomLigneCode(c)}
                onSelect={() => {
                  if (!estActuel) onHoraire(h, c.poste.id)
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
                <span className="grid flex-1 pl-1">
                  <span className="text-sm whitespace-nowrap tabular-nums">
                    {heureAffichee(h.debut)}-{heureAffichee(h.fin)} ·{' '}
                    {heures(travailCode(h))}
                  </span>
                  {c.alerte && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      {c.alerte}
                    </span>
                  )}
                </span>
                {estActuel ? (
                  <Check
                    className="size-3.5 text-primary"
                    aria-label="Horaire actuel"
                  />
                ) : (
                  <span className="size-3.5" />
                )}
              </ContextMenuItem>
            )
          })}
        </ContextMenuGroup>
      ))}
      {(horsPermis || codes.texte) && codes.codes.length > 0 && (
        <ContextMenuSeparator />
      )}
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
      {codes.texte && !horsPermis && (
        <ContextMenuItem disabled>{codes.texte}</ContextMenuItem>
      )}
    </ContextMenuContent>
  )
}

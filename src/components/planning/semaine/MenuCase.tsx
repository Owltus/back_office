/*
 * Menu du clic droit sur une case (prototype `MenuCase.tsx`) : tous les
 * horaires que la personne peut faire, rangés par casquette (un poste de sa
 * fiche, métier habituel d'abord), pour changer d'un clic sur CE poste ;
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
  NIVEAUX,
  ROUGE_CODE,
  texteSur,
} from '#/lib/planning/affichage.ts'
import type { RubriquesCase } from '#/components/planning/codesCase.ts'
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
  /** Codes permis par casquette (règle unique), et pourquoi s'il n'y en a
   * pas ; le code actuel qui n'est plus permis est montré grisé. */
  rubriques: RubriquesCase
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
  const { rubriques, actuel, actuelPoste, validation, etoile, vider } =
    ouverture
  const horsPermis = rubriques.actuel
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
      {rubriques.rubriques.map((r, i) => (
        <ContextMenuGroup key={r.poste.id} aria-label={r.poste.nom}>
          {i > 0 && <ContextMenuSeparator />}
          <ContextMenuLabel className="flex items-center gap-1.5 pt-1 pb-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: r.poste.couleur }}
            />
            <span className="flex-1">{r.poste.nom}</span>
            <span className="pl-3 font-normal tracking-normal normal-case">
              {r.niveau ? NIVEAUX[r.niveau].libelle : 'hors de sa fiche'}
            </span>
          </ContextMenuLabel>
          {r.lignes.map(({ horaire: h, alerte }) => {
            const estActuel = actuel === h.id && actuelPoste === r.poste.id
            return (
              <ContextMenuItem
                key={h.id}
                aria-label={`${h.code}, ${h.nom}${alerte ? `, ${alerte}` : ''}`}
                onSelect={() => {
                  if (!estActuel) onHoraire(h, r.poste.id)
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
                  <span className="text-sm tabular-nums">
                    {heureAffichee(h.debut)}-{heureAffichee(h.fin)} ·{' '}
                    {heures(travailCode(h))}
                  </span>
                  {alerte && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      {alerte}
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
      {(horsPermis || rubriques.texte) && rubriques.rubriques.length > 0 && (
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
      {rubriques.texte && !horsPermis && (
        <ContextMenuItem disabled>{rubriques.texte}</ContextMenuItem>
      )}
    </ContextMenuContent>
  )
}

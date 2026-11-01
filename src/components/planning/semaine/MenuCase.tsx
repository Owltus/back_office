/*
 * Menu du clic droit sur une case (prototype `MenuCase.tsx`) : tous les
 * horaires que la personne peut faire sur ses postes, chacun une seule fois,
 * rangés par moment, posés d'un clic sur le poste déduit (jamais affiché :
 * heures seulement) ;
 * valider le shift, la journée étoile ; un repos (en tête) ou une absence
 * (en bas) posés d'un clic comme un horaire. Le
 * positionnement au curseur et la fermeture (Échap, clic ailleurs) sont ceux
 * du `ContextMenu` de shadcn.
 */

import { BadgeCheck, Check, Coffee, Eraser, Star, Undo2 } from 'lucide-react'

import {
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from '#/components/ui/context-menu.tsx'
import {
  grouperHoraires,
  libelleHoraire,
  texteSur,
} from '#/lib/planning/affichage.ts'
import {
  heuresEtDuree,
  nomLigneCode,
  texteChangementPoste,
} from '#/components/planning/codesCase.ts'
import type { CodesUniquesCase } from '#/components/planning/codesCase.ts'
import { PastilleHoraire } from '#/components/planning/PastilleHoraire.tsx'
import { JOURS } from '#/lib/planning/types.ts'
import type { Horaire, Motif } from '#/lib/planning/types.ts'

export interface OuvertureMenu {
  salarie_id: number
  jour: number
  nom: string
  /** Code horaire actuel du shift de la case, et son poste. */
  actuel: number | null | undefined
  actuelPoste?: number
  /** Horaires permis, chacun une fois avec son poste déduit (règle unique
   * par poste), et pourquoi s'il n'y en a pas ; l'horaire actuel qui n'est plus
   * permis est montré grisé. */
  codes: CodesUniquesCase
  validation?: { active: boolean; onBasculer: () => void; repos?: boolean }
  etoile?: { active: boolean; onBasculer: () => void }
  /** La case a un shift : la remettre à « Non attribué ». */
  vider?: () => void
  /** Repos et absences posables (`motifsDuJour`), le motif posé ici, et la
   * pose d'un clic. Absent quand le jour ne se change pas (semaine type). */
  absences?: {
    repos: Motif[]
    autres: Motif[]
    actuel: number | null
    onPoser: (motifId: number) => void
  }
}

export function MenuCase({
  ouverture,
  onHoraire,
}: {
  ouverture: OuvertureMenu | null
  onHoraire: (h: Horaire, posteId: number) => void
}) {
  if (!ouverture) return null
  const { codes, actuel, actuelPoste, validation, etoile, vider, absences } =
    ouverture
  const groupeMotifs = (libelle: string, liste: Motif[]) =>
    absences &&
    liste.length > 0 && (
      <>
        <ContextMenuSeparator />
        <ContextMenuGroup aria-label={libelle}>
          <ContextMenuLabel className="pt-1 pb-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {libelle}
          </ContextMenuLabel>
          {liste.map((m) => {
            const estActuel = absences.actuel === m.id
            return (
              <ContextMenuItem
                key={m.id}
                aria-label={`${m.code}, ${m.nom}`}
                onSelect={() => {
                  if (!estActuel) absences.onPoser(m.id)
                }}
              >
                <span
                  className="min-w-12 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-semibold"
                  style={{ background: m.couleur, color: texteSur(m.couleur) }}
                >
                  {m.nature === 'repos' ? (
                    <Coffee className="mx-auto size-3.5" aria-hidden />
                  ) : (
                    m.code
                  )}
                </span>
                <span className="flex-1 truncate pl-1 text-sm">{m.nom}</span>
                {estActuel ? (
                  <Check
                    className="size-3.5 text-primary"
                    aria-label="Motif actuel"
                  />
                ) : (
                  <span className="size-3.5" />
                )}
              </ContextMenuItem>
            )
          })}
        </ContextMenuGroup>
      </>
    )
  const horsPermis = codes.actuel
  const parId = new Map(codes.codes.map((c) => [c.horaire.id, c]))
  return (
    <ContextMenuContent className="w-60">
      <ContextMenuLabel className="text-xs text-muted-foreground">
        {ouverture.nom} · {JOURS[ouverture.jour]}
      </ContextMenuLabel>
      {vider && (
        <ContextMenuItem onSelect={vider}>
          <Eraser />
          <span className="font-medium">Vider la case</span>
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
                : validation.repos
                  ? 'Valider ce repos'
                  : 'Valider ce shift'}
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
            {etoile.active && (
              <Check className="ml-auto size-3.5 text-primary" />
            )}
          </ContextMenuItem>
        </>
      )}
      {groupeMotifs('Repos', absences?.repos ?? [])}
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
                <PastilleHoraire couleur={h.couleur} />
                <span className="grid flex-1 pl-1">
                  <span className="text-sm whitespace-nowrap tabular-nums">
                    {heuresEtDuree(h)}
                  </span>
                  {c.alerte && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      {c.alerte}
                    </span>
                  )}
                  {c.changePoste && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      {texteChangementPoste(c.changePoste)}
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
          aria-label={`${libelleHoraire(horsPermis.horaire)}, actuel, ${horsPermis.texte}`}
        >
          <PastilleHoraire couleur={horsPermis.horaire.couleur} />
          <span className="shrink-0 pl-1 text-sm whitespace-nowrap tabular-nums">
            {libelleHoraire(horsPermis.horaire)}
          </span>
          <span className="flex-1 pl-1 text-xs">
            actuel · {horsPermis.texte}
          </span>
        </ContextMenuItem>
      )}
      {codes.texte && !horsPermis && (
        <ContextMenuItem disabled>{codes.texte}</ContextMenuItem>
      )}
      {groupeMotifs('Absences', absences?.autres ?? [])}
    </ContextMenuContent>
  )
}

/*
 * Menu d'un jour de la vue mois (prototype `MenuCase.tsx`), ouvert au clic
 * ou au clic droit sur une case, au curseur : tous les horaires que la
 * personne peut faire sur ses postes, chacun une seule fois, rangés par
 * moment, le poste déduit (étiquette s'il n'est pas son métier habituel),
 * pour changer d'un clic ; valider ou remettre en
 * proposition, la journée étoile, et l'ouverture de la semaine pour tout
 * modifier (absence, école…).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  BadgeCheck,
  CalendarRange,
  Check,
  Eraser,
  Star,
  Undo2,
} from 'lucide-react'

import {
  dureeHoraire,
  grouperHoraires,
  heures,
  ROUGE_CODE,
  texteSur,
} from '#/lib/planning/affichage.ts'
import type { ShiftOut } from '#/lib/planning/semaine.ts'
import {
  codesUniques,
  nomLigneCode,
  rubriquesDeLaCase,
} from '#/components/planning/codesCase.ts'
import type { CodeUnique, SourceCase } from '#/components/planning/codesCase.ts'
import { EtiquettePoste } from '#/components/planning/EtiquettePoste.tsx'
import { heureAffichee } from '#/lib/planning/temps.ts'
import type { Horaire, Referentiel, Salarie } from '#/lib/planning/types.ts'

export interface OuvertureMenu {
  salarieId: number
  date: string
  x: number
  y: number
  /** Place à pourvoir : le menu s'ouvre sur son poste (case sans shift). */
  posteId?: number
  /** Et sur son code : proposé en tête, sous « Place à pourvoir ». */
  horaireId?: number | null
}

const ITEM =
  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent'

export function MenuJour({
  ouverture,
  titre,
  personne,
  referentiel,
  jour,
  source,
  shift,
  repos = null,
  ecrire,
  onHoraire,
  validation,
  etoile,
  onVider,
  onSemaine,
  onFermer,
}: {
  ouverture: OuvertureMenu
  titre: string
  personne: Salarie
  referentiel: Pick<Referentiel, 'horaires' | 'postes' | 'motifs'>
  /** Jour de la case dans sa semaine (0 = lundi). */
  jour: number
  /** La semaine de la case et ses voisines (codes permis, coupure de repos). */
  source: SourceCase
  shift?: ShiftOut
  /** Jour de repos (fixé par la semaine type, ou déduit) : dit en tête. */
  repos?: { fixe: boolean } | null
  ecrire: boolean
  onHoraire: (h: Horaire, posteId: number) => void
  validation?: { active: boolean; onBasculer: () => void }
  etoile?: { active: boolean; onBasculer: () => void }
  /** La case a un shift : la remettre à « Non attribué ». */
  onVider?: () => void
  onSemaine: () => void
  onFermer: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: ouverture.x, top: ouverture.y })

  // Le menu reste dans la fenêtre, à 8 px des bords au moins.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setPos({
      left: Math.max(8, Math.min(ouverture.x, window.innerWidth - r.width - 8)),
      top: Math.max(
        8,
        Math.min(ouverture.y, window.innerHeight - r.height - 8),
      ),
    })
  }, [ouverture.x, ouverture.y])

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer()
    }
    window.addEventListener('keydown', touche)
    window.addEventListener('resize', onFermer)
    ref.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
    return () => {
      window.removeEventListener('keydown', touche)
      window.removeEventListener('resize', onFermer)
    }
  }, [onFermer])

  // Tous les codes de la personne, chacun une fois (union de ses postes,
  // règle unique par poste, coupure de repos choisissable avec son alerte),
  // le poste déduit : celui de la place s'il le permet, sinon le meilleur
  // niveau de la fiche, à niveau égal celui du shift (`posteDeduit`).
  const placePoste = shift ? undefined : ouverture.posteId
  const u = ecrire
    ? codesUniques(
        rubriquesDeLaCase({ referentiel, personne, jour, source, shift }),
        personne,
        referentiel.postes,
        shift?.poste_id,
        placePoste,
      )
    : null
  // Le code de la place à pourvoir, s'il est permis sur son poste : en tête
  // du menu, pour être posé d'un clic (la vue semaine le choisit d'office).
  // Il n'est pas répété dans la liste.
  const place =
    placePoste !== undefined
      ? u?.codes.find(
          (c) =>
            c.horaire.id === ouverture.horaireId && c.poste.id === placePoste,
        )
      : undefined
  const liste = (u?.codes ?? []).filter((c) => c !== place)
  const parId = new Map(liste.map((c) => [c.horaire.id, c]))
  const choisir = (action: () => void) => () => {
    onFermer()
    action()
  }
  const boutonCode = (c: CodeUnique) => {
    const { horaire: h, alerte, poste } = c
    const actuel = shift?.type_shift_id === h.id && shift.poste_id === poste.id
    return (
      <button
        key={h.id}
        type="button"
        role="menuitem"
        aria-label={nomLigneCode(c)}
        className={ITEM}
        onClick={choisir(() => {
          if (!actuel) onHoraire(h, poste.id)
        })}
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
        <span className="grid flex-1">
          <span className="text-sm whitespace-nowrap tabular-nums">
            {heureAffichee(h.debut)}–{heureAffichee(h.fin)} ·{' '}
            {heures(dureeHoraire(h.debut, h.fin) - h.pause)}
          </span>
          {alerte && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {alerte}
            </span>
          )}
        </span>
        {c.horsHabituel && <EtiquettePoste poste={poste} />}
        {actuel ? (
          <Check className="size-4 shrink-0 text-primary" />
        ) : (
          <span className="size-4 shrink-0" />
        )}
      </button>
    )
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onFermer}
        onContextMenu={(e) => {
          e.preventDefault()
          onFermer()
        }}
      />
      <div
        ref={ref}
        role="menu"
        aria-label={titre}
        style={pos}
        className="fixed z-50 max-h-[80dvh] min-w-80 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {titre}
        </div>
        {repos && (
          <div className="px-2 pb-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Repos</span>
            {repos.fixe
              ? ' : vient de la semaine type.'
              : ' : un horaire choisi ici le remplace.'}
          </div>
        )}
        {place && (
          <div role="group" aria-label="Place à pourvoir">
            <div className="flex items-center gap-1.5 px-2 pt-1 pb-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Place à pourvoir
              <span className="font-normal tracking-normal normal-case">
                · {place.poste.nom}
              </span>
            </div>
            {boutonCode(place)}
            <div className="-mx-1 my-1 h-px bg-border" />
          </div>
        )}
        {ecrire && onVider && (
          <button
            type="button"
            role="menuitem"
            className={ITEM}
            onClick={choisir(onVider)}
          >
            <Eraser className="size-4" />
            <span className="flex-1 font-medium">Non attribué</span>
            <span className="text-xs text-muted-foreground">vider la case</span>
          </button>
        )}
        {ecrire && validation && (
          <>
            <div className="-mx-1 my-1 h-px bg-border" />
            <button
              type="button"
              role="menuitem"
              className={ITEM}
              onClick={choisir(validation.onBasculer)}
            >
              {validation.active ? (
                <Undo2 className="size-4" />
              ) : (
                <BadgeCheck className="size-4 text-emerald-500" />
              )}
              <span className="flex-1 font-medium">
                {validation.active
                  ? 'Remettre en proposition'
                  : 'Valider ce shift'}
              </span>
              <span className="text-xs text-muted-foreground">
                {validation.active
                  ? 'recalculable'
                  : 'gardé par les générations'}
              </span>
            </button>
          </>
        )}
        {ecrire && etoile && (
          <>
            <div className="-mx-1 my-1 h-px bg-border" />
            <button
              type="button"
              role="menuitem"
              className={ITEM}
              onClick={choisir(etoile.onBasculer)}
            >
              <Star className="size-4 text-amber-500" />
              <span className="flex-1 font-medium">Journée étoile</span>
              <span className="text-xs text-muted-foreground">
                {etoile.active ? 'retirer' : 'mettre ce jour'}
              </span>
              {etoile.active && <Check className="size-4 text-primary" />}
            </button>
          </>
        )}
        {ecrire && <div className="-mx-1 my-1 h-px bg-border" />}
        <button
          type="button"
          role="menuitem"
          className={ITEM}
          onClick={choisir(onSemaine)}
        >
          <CalendarRange className="size-4" />
          <span className="flex-1 font-medium">Ouvrir la semaine</span>
          <span className="text-xs text-muted-foreground">
            {ecrire ? 'poste, absence, école…' : 'voir le détail'}
          </span>
        </button>
        {grouperHoraires(liste.map((c) => c.horaire)).map((g) => (
          <div key={g.libelle} role="group" aria-label={g.libelle}>
            <div className="-mx-1 my-1 h-px bg-border" />
            <div className="px-2 pt-1 pb-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {g.libelle}
            </div>
            {g.horaires.map((h) => boutonCode(parId.get(h.id)!))}
          </div>
        ))}
        {u && (u.actuel || u.texte) && (
          <div className="-mx-1 my-1 h-px bg-border" />
        )}
        {u?.actuel && (
          <div
            role="menuitem"
            aria-disabled="true"
            aria-label={`${u.actuel.horaire.code}, actuel, ${u.actuel.texte}`}
            className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground opacity-60"
          >
            <span className="min-w-12 shrink-0 rounded border px-1.5 py-0.5 text-center text-xs font-semibold">
              {u.actuel.horaire.code}
            </span>
            <span className="flex-1 text-xs">actuel · {u.actuel.texte}</span>
          </div>
        )}
        {u?.texte && !u.actuel && (
          <div
            role="menuitem"
            aria-disabled="true"
            className="px-2 py-1.5 text-sm text-muted-foreground"
          >
            {u.texte}
          </div>
        )}
      </div>
    </>
  )
}

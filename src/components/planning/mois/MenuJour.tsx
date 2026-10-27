/*
 * Menu d'un jour de la vue mois (prototype `MenuCase.tsx`), ouvert au clic
 * ou au clic droit sur une case, au curseur : les horaires possibles pour
 * changer d'un clic, valider ou remettre en proposition, la journée étoile,
 * et l'ouverture de la semaine pour tout modifier (poste, absence, école…).
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
  heures,
  horairesDuPoste,
  ROUGE_CODE,
  texteSur,
} from '#/lib/planning/affichage.ts'
import type { ShiftOut } from '#/lib/planning/semaine.ts'
import { heureAffichee } from '#/lib/planning/temps.ts'
import type { Horaire, Poste, Salarie } from '#/lib/planning/types.ts'

export interface OuvertureMenu {
  salarieId: number
  date: string
  x: number
  y: number
}

/** Poste de référence d'une case : celui du shift, sinon le 1er titulaire,
 * sinon la 1re compétence, sinon le 1er poste. */
export function posteDeReference(
  personne: Salarie,
  postes: Poste[],
  shift?: ShiftOut,
): number | undefined {
  return (
    shift?.poste_id ??
    personne.competences.find((c) => c.niveau === 'titulaire')?.poste_id ??
    personne.competences.at(0)?.poste_id ??
    postes.at(0)?.id
  )
}

/** Codes proposés : ceux du poste, réduits à la fiche s'il en reste, plus le
 * code actuel du shift ; triés par heure de début. */
export function horairesProposes(
  personne: Salarie,
  horaires: Horaire[],
  poste: Poste | undefined,
  shift?: ShiftOut,
): Horaire[] {
  const duPoste = horairesDuPoste(horaires, poste)
  const deLaFiche = duPoste.filter((h) =>
    personne.shifts_autorises.includes(h.id),
  )
  return (deLaFiche.length ? deLaFiche : duPoste)
    .concat(horaires.filter((h) => h.id === shift?.type_shift_id))
    .filter((h, i, l) => l.findIndex((x) => x.id === h.id) === i)
    .sort((a, b) => a.debut.localeCompare(b.debut))
}

const ITEM =
  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent'

export function MenuJour({
  ouverture,
  titre,
  personne,
  horaires,
  postes,
  shift,
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
  horaires: Horaire[]
  postes: Poste[]
  shift?: ShiftOut
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

  const posteId = posteDeReference(personne, postes, shift)
  const proposes = ecrire
    ? horairesProposes(
        personne,
        horaires,
        postes.find((p) => p.id === posteId),
        shift,
      )
    : []
  const choisir = (action: () => void) => () => {
    onFermer()
    action()
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
        className="fixed z-50 max-h-[80dvh] min-w-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {titre}
        </div>
        {proposes.map((h) => (
          <button
            key={h.id}
            type="button"
            role="menuitem"
            aria-label={`${h.code}, ${h.nom}`}
            className={ITEM}
            onClick={choisir(() => {
              if (shift?.type_shift_id !== h.id && posteId !== undefined)
                onHoraire(h, posteId)
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
            <span className="flex-1 text-sm tabular-nums">
              {heureAffichee(h.debut)}–{heureAffichee(h.fin)} ·{' '}
              {heures(dureeHoraire(h.debut, h.fin) - h.pause)}
            </span>
            {shift?.type_shift_id === h.id && (
              <Check className="size-4 text-primary" />
            )}
          </button>
        ))}
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
      </div>
    </>
  )
}

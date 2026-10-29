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
  grouperHoraires,
  heures,
  ROUGE_CODE,
  texteSur,
} from '#/lib/planning/affichage.ts'
import { posteDeReference } from '#/lib/planning/eligibilite.ts'
import type { ShiftOut } from '#/lib/planning/semaine.ts'
import {
  actuelNonPermis,
  codesDeLaCase,
} from '#/components/planning/codesCase.ts'
import type { SourceCase } from '#/components/planning/codesCase.ts'
import { heureAffichee } from '#/lib/planning/temps.ts'
import type { Horaire, Referentiel, Salarie } from '#/lib/planning/types.ts'

export interface OuvertureMenu {
  salarieId: number
  date: string
  x: number
  y: number
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

  const posteId = posteDeReference(personne, referentiel.postes, shift)
  const permis = ecrire
    ? codesDeLaCase({ referentiel, personne, posteId, jour, source })
    : null
  const proposes = permis?.codes ?? []
  // Le code actuel du shift qui n'est plus permis ici : sa propre ligne,
  // grisée, pas de doublon parmi les codes écartés.
  const horsPermis = permis
    ? actuelNonPermis(permis, referentiel.horaires, shift?.type_shift_id)
    : null
  const ecartes = (permis?.ecartes ?? []).filter(
    (e) => e.horaire.id !== horsPermis?.horaire.id,
  )
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
        {grouperHoraires(proposes).map((g) => (
          <div key={g.libelle} role="group" aria-label={g.libelle}>
            <div className="-mx-1 my-1 h-px bg-border" />
            <div className="px-2 pt-1 pb-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {g.libelle}
            </div>
            {g.horaires.map((h) => (
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
          </div>
        ))}
        {permis && (ecartes.length > 0 || permis.texte || horsPermis) && (
          <div className="-mx-1 my-1 h-px bg-border" />
        )}
        {horsPermis && (
          <div
            role="menuitem"
            aria-disabled="true"
            aria-label={`${horsPermis.horaire.code}, actuel, ${horsPermis.texte}`}
            className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground opacity-60"
          >
            <span className="min-w-12 shrink-0 rounded border px-1.5 py-0.5 text-center text-xs font-semibold">
              {horsPermis.horaire.code}
            </span>
            <span className="flex-1 text-xs">actuel · {horsPermis.texte}</span>
          </div>
        )}
        {permis?.texte && !permis.ecartes.length && !horsPermis && (
          <div
            role="menuitem"
            aria-disabled="true"
            className="px-2 py-1.5 text-sm text-muted-foreground"
          >
            {permis.texte}
          </div>
        )}
        {ecartes.map((e) => (
          <div
            key={e.horaire.id}
            role="menuitem"
            aria-disabled="true"
            aria-label={`${e.horaire.code}, ${e.texte}`}
            className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground opacity-60"
          >
            <span className="min-w-12 shrink-0 rounded border px-1.5 py-0.5 text-center text-xs font-semibold">
              {e.horaire.code}
            </span>
            <span className="flex-1 text-xs">{e.texte}</span>
          </div>
        ))}
      </div>
    </>
  )
}

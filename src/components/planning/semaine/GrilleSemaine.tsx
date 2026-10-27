/*
 * La grille de la semaine (prototype `PlanningPage.tsx` lignes 677-953,
 * `Cellule.tsx`) : en-tête des jours collant, colonne du staff collante,
 * une ligne par catégorie, puis une ligne par personne. Chaque ligne est
 * mémoïsée : seules les lignes dont les données changent se redessinent.
 */

import { memo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { BadgeCheck, Plus, TriangleAlert } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import {
  dateCourte,
  heures,
  metier,
  NIVEAUX,
  deNom,
} from '#/lib/planning/affichage.ts'
import type { BilanOut } from '#/lib/planning/semaine.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type { Poste, Salarie } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'
import {
  CarteShiftDeplacable,
  CarteStatutDeplacable,
} from '#/components/planning/semaine/Cartes.tsx'
import type { ContenuCarte } from '#/components/planning/semaine/Cartes.tsx'
import {
  etatHeures,
  titreHeures,
} from '#/components/planning/semaine/edition.ts'
import type {
  ContenuStatut,
  Indice,
} from '#/components/planning/semaine/edition.ts'

/** Ce qu'affiche une case. */
export interface DonneesCase {
  shift: { id: number; c: ContenuCarte } | null
  statut: ContenuStatut | null
}

/** Ce qu'affiche une ligne de personne (calculé une fois par semaine). */
export interface DonneesLigne {
  salarie: Salarie
  bilan: BilanOut | undefined
  cases: DonneesCase[]
}

/** Rappels stables (identité fixe) : n'invalident pas la mémoïsation. */
export interface RappelsGrille {
  ajouter: (salarieId: number, jour: number) => void
  ouvrirShift: (shiftId: number) => void
  fiche: (salarieId: number) => void
  validerJour: (jour: number) => void
}

export function GrilleSemaine({
  dates,
  aujourdhui,
  groupes,
  nbPersonnes,
  postes,
  gestes,
  cliquable,
  verrou,
  enGlisser,
  joursAValider,
  validerJourActif,
  indice,
  rappels,
}: {
  dates: string[]
  aujourdhui: string
  groupes: Array<{ id: number; nom: string; lignes: DonneesLigne[] }>
  nbPersonnes: number
  postes: Poste[]
  /** Droit d'écriture et semaine ouverte : glisser, +, clic. */
  gestes: boolean
  /** Droit d'écriture : un clic sur une carte (refusé avec un message si la semaine est verrouillée). */
  cliquable: boolean
  verrou: boolean
  enGlisser: boolean
  /** Jours qui ont au moins une proposition (bouton « valider le jour »). */
  joursAValider: boolean[]
  validerJourActif: boolean
  indice: (s: Salarie, jour: number, statut: ContenuStatut | null) => Indice
  rappels: RappelsGrille
}) {
  return (
    <table
      className="planning-grille w-full min-w-[1080px] table-fixed border-separate border-spacing-0 text-sm"
      data-verrou={verrou ? '' : undefined}
      data-glisser={enGlisser ? '' : undefined}
    >
      <colgroup>
        <col className="w-[200px]" />
        {dates.map((d) => (
          <col key={d} />
        ))}
        <col className="w-[112px]" />
      </colgroup>
      <thead>
        <tr>
          <th className="sticky top-0 left-0 z-30 border-r border-b bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
            {nbPersonnes} personne{nbPersonnes > 1 ? 's' : ''}
          </th>
          {dates.map((d, j) => {
            const estAujourdhui = d === aujourdhui
            return (
              <th
                key={d}
                className="sticky top-0 z-20 border-b bg-card px-2 py-2 text-left font-medium"
                aria-current={estAujourdhui ? 'date' : undefined}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="min-w-0">
                    <span className="block text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                      {JOURS[j].slice(0, 3)}
                    </span>
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
                        estAujourdhui && 'text-primary',
                      )}
                    >
                      {dateCourte(d)}
                      {estAujourdhui && (
                        <span className="sr-only"> (aujourd'hui)</span>
                      )}
                    </span>
                  </div>
                  {joursAValider[j] && (
                    <Tip
                      label={`Valider toutes les propositions du ${JOURS[j].toLowerCase()}`}
                    >
                      <button
                        type="button"
                        className="grid size-7 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground transition-colors hover:border-emerald-500 hover:text-emerald-500 disabled:pointer-events-none disabled:opacity-50"
                        disabled={!validerJourActif}
                        onClick={() => rappels.validerJour(j)}
                        aria-label={`Valider le ${JOURS[j].toLowerCase()}`}
                      >
                        <BadgeCheck className="size-3.5" />
                      </button>
                    </Tip>
                  )}
                </div>
              </th>
            )
          })}
          <th className="sticky top-0 z-20 border-b border-l bg-card px-2.5 py-2 text-left font-medium">
            <span className="block text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Semaine
            </span>
            <span className="font-semibold">Heures</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {groupes.map((g) => [
          <tr key={`g-${g.id}`}>
            <td colSpan={JOURS.length + 2} className="border-b bg-muted/50 p-0">
              <span className="sticky left-0 inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                {g.nom}
                <small className="text-[11px] font-semibold tracking-normal opacity-70">
                  {g.lignes.length}
                </small>
              </span>
            </td>
          </tr>,
          ...g.lignes.map((l) => (
            <LigneStaff
              key={`s-${l.salarie.id}`}
              ligne={l}
              postes={postes}
              gestes={gestes}
              cliquable={cliquable}
              indices={
                enGlisser
                  ? l.cases.map((c, j) =>
                      indice(l.salarie, j, c.shift ? null : c.statut),
                    )
                  : null
              }
              rappels={rappels}
            />
          )),
        ])}
      </tbody>
    </table>
  )
}

const LigneStaff = memo(function LigneStaff({
  ligne,
  postes,
  gestes,
  cliquable,
  indices,
  rappels,
}: {
  ligne: DonneesLigne
  postes: Poste[]
  gestes: boolean
  cliquable: boolean
  indices: Indice[] | null
  rappels: RappelsGrille
}) {
  const { salarie: s, bilan } = ligne
  const alertes = bilan?.alertes ?? []
  const loi = alertes.some((a) => a.nature === 'loi')
  return (
    <tr className="group/ligne">
      <td className="sticky left-0 z-10 border-r border-b bg-card p-1 align-middle group-hover/ligne:bg-muted">
        <Tip
          side="right"
          label={
            <div className="max-w-72 space-y-0.5">
              <div className="font-semibold">Ouvrir la fiche</div>
              {alertes.map((a, i) => (
                <div key={i}>⚠ {a.message}</div>
              ))}
            </div>
          }
        >
          <button
            type="button"
            className="group/nom grid w-full min-w-0 gap-0.5 rounded-md px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => rappels.fiche(s.id)}
            aria-label={`Ouvrir la fiche ${deNom(`${s.prenom} ${s.nom}`)}${alertes.length ? `, ${alertes.length} alerte(s)` : ''}`}
          >
            <span className="flex min-w-0 items-center gap-1.5 font-semibold group-hover/nom:text-primary group-hover/nom:underline group-hover/nom:underline-offset-2">
              <span className="truncate">
                {s.prenom} {s.nom}
              </span>
              {alertes.length > 0 && (
                <TriangleAlert
                  className={cn(
                    'size-3.5 shrink-0',
                    loi ? 'text-destructive' : 'text-amber-500',
                  )}
                  aria-hidden
                />
              )}
            </span>
            <span className="flex min-w-0 items-center gap-1">
              {s.competences.map((c) => {
                const p = postes.find((x) => x.id === c.poste_id)
                return p ? (
                  <span
                    key={c.poste_id}
                    className="planning-point-poste"
                    data-niveau={c.niveau}
                    style={{ '--couleur': p.couleur } as CSSProperties}
                    aria-label={`${p.nom} · ${NIVEAUX[c.niveau].libelle}`}
                    role="img"
                  />
                ) : null
              })}
              <span className="ml-0.5 truncate text-xs text-muted-foreground">
                {metier(s, postes)}
              </span>
            </span>
          </button>
        </Tip>
      </td>
      {ligne.cases.map((c, j) => (
        <Cellule
          key={j}
          id={`case:${s.id}:${j}`}
          salarieId={s.id}
          jour={j}
          indice={indices?.[j] ?? null}
          gestes={gestes}
          vide={!c.shift && !c.statut}
          onAjouter={rappels.ajouter}
        >
          {c.shift ? (
            <CarteShiftDeplacable
              id={`shift:${c.shift.id}`}
              c={c.shift.c}
              actif={gestes}
              cliquable={cliquable}
              onOuvrir={() => rappels.ouvrirShift(c.shift!.id)}
            />
          ) : c.statut ? (
            <CarteStatutDeplacable
              id={`statut:${s.id}:${j}`}
              s={c.statut}
              actif={gestes}
              cliquable={cliquable}
              onOuvrir={() => rappels.ajouter(s.id, j)}
            />
          ) : null}
        </Cellule>
      ))}
      <td className="border-b border-l px-2.5 py-1.5 align-middle group-hover/ligne:bg-muted/40">
        {bilan && <Heures s={s} b={bilan} />}
      </td>
    </tr>
  )
})

function Heures({ s, b }: { s: Salarie; b: BilanOut }) {
  const etat = etatHeures(s, b)
  const ratio = b.minutes_contrat
    ? Math.min(b.minutes / b.minutes_contrat, 1)
    : 0
  return (
    <Tip label={titreHeures(s, b)} side="left">
      <div className="grid gap-1 whitespace-nowrap tabular-nums" tabIndex={0}>
        <span
          className={cn(
            etat === 'danger' && 'text-destructive',
            etat === 'attention' && 'text-amber-500',
          )}
        >
          {s.forfait_jours ? (
            <>
              <strong>{b.jours} j</strong>
              <small className="text-muted-foreground"> · forfait</small>
            </>
          ) : (
            <>
              <strong>{heures(b.minutes)}</strong>
              <small className="text-muted-foreground">
                {' '}
                / {heures(b.minutes_contrat)}
              </small>
            </>
          )}
        </span>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full',
              etat === 'danger'
                ? 'bg-destructive'
                : etat === 'attention'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500',
            )}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      </div>
    </Tip>
  )
}

function Cellule({
  id,
  salarieId,
  jour,
  indice,
  gestes,
  vide,
  onAjouter,
  children,
}: {
  id: string
  salarieId: number
  jour: number
  indice: Indice
  gestes: boolean
  vide: boolean
  onAjouter: (salarieId: number, jour: number) => void
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !gestes })
  return (
    <td
      ref={setNodeRef}
      className="planning-cellule h-16 border-b p-0 align-top group-hover/ligne:bg-muted/40"
      data-case={`${salarieId}:${jour}`}
      data-indice={indice ?? undefined}
      data-survol={isOver ? '' : undefined}
    >
      <div className="group/case relative grid h-full auto-rows-fr gap-1 p-[5px]">
        {children}
        {vide && (
          <span className="self-center justify-self-center text-[11.5px] text-muted-foreground/70 italic">
            Non attribué
          </span>
        )}
        {vide && gestes && (
          <button
            type="button"
            className="planning-ajouter absolute right-1.5 bottom-1.5 grid size-6 place-items-center rounded-md border border-dashed bg-card text-muted-foreground opacity-0 transition-opacity group-hover/case:opacity-100 hover:border-primary hover:text-primary focus-visible:opacity-100"
            onClick={() => onAjouter(salarieId, jour)}
            aria-label="Ajouter un shift"
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </div>
    </td>
  )
}

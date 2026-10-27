/*
 * Grille de la vue mois (prototype `VueMois.tsx`, lignes 662-1140) : une
 * ligne par personne, rangées par catégorie ; une colonne par jour du mois,
 * sous l'en-tête des semaines (« S45 », un clic ouvre la semaine). Une case
 * de shift est une pastille à la couleur du code horaire ; repos, absence,
 * école et hors contrat fusionnent en bandeaux continus, même d'une semaine
 * à l'autre, chaque jour restant une zone à part (clic, clic droit, dépôt).
 *
 * Glisser-déposer (`@dnd-kit/core`, souris 5 px, doigt appui long) : un
 * shift vers n'importe quelle case du mois (Alt : le dupliquer), un repos ou
 * une absence posée dans sa semaine. Les indices pendant le glisser sont
 * visuels : la base tranche.
 */

import { useMemo, useState } from 'react'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import {
  CalendarOff,
  Coffee,
  GraduationCap,
  Lock,
  Star,
  TriangleAlert,
  UserX,
} from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import {
  couleurShift,
  heures,
  journeeEtoile,
  numeroSemaine,
  parGroupe,
  ROUGE_CODE,
} from '#/lib/planning/affichage.ts'
import { estEcole } from '#/lib/planning/semaine.ts'
import type { AlerteOut, SemaineOut, ShiftOut } from '#/lib/planning/semaine.ts'
import { ajouterJours, heureAffichee } from '#/lib/planning/temps.ts'
import type { Horaire, Referentiel, Salarie } from '#/lib/planning/types.ts'
import { JOURS } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'
import { PointsPresence } from '#/components/planning/semaine/Presence.tsx'
import {
  caseDe,
  cleBandeau,
  raisonFermee,
  reperer,
} from '#/components/planning/mois/mois.ts'
import type { CaseMois, EtatSemaine } from '#/components/planning/mois/mois.ts'

const fmt = (o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('fr-FR', { ...o, timeZone: 'UTC' })
const JOUR_LONG = fmt({ weekday: 'short', day: 'numeric', month: 'short' })
const JOUR_COURT = fmt({ day: 'numeric', month: 'short' })
export const dateLongue = (iso: string) =>
  JOUR_LONG.format(new Date(`${iso}T12:00:00Z`))
const dateMoyenne = (iso: string) =>
  JOUR_COURT.format(new Date(`${iso}T12:00:00Z`))

const GRIS = '#94a3b8'

export type EnVol =
  | {
      type: 'shift'
      lundi: string
      date: string
      shift: ShiftOut
      couleur: string
    }
  | {
      type: 'statut'
      lundi: string
      date: string
      salarieId: number
      jour: number
      repos: boolean
      nom: string
    }

type Indice = 'ok' | 'depannage' | 'deconseille' | null

export interface Depot {
  vol: EnVol
  salarieId: number
  date: string
  copie: boolean
}

export function GrilleMois({
  mois,
  jours,
  lundis,
  semaines,
  etats,
  referentiel,
  presents,
  aujourdhui,
  glisser,
  onSemaine,
  onFiche,
  onJour,
  onDeposer,
}: {
  mois: string
  jours: string[]
  lundis: string[]
  semaines: Map<string, SemaineOut>
  etats: Map<string, EtatSemaine>
  referentiel: Referentiel
  presents: Salarie[]
  aujourdhui: string
  /** Glisser permis (écriture, rien en cours). */
  glisser: boolean
  onSemaine: (lundi: string) => void
  onFiche: (salarieId: number) => void
  /** Clic (x, y null) ou clic droit sur un jour. */
  onJour: (
    salarieId: number,
    date: string,
    x: number,
    y: number,
    clicDroit: boolean,
  ) => void
  onDeposer: (d: Depot) => void
}) {
  const { motifs, horaires, groupes } = referentiel
  const [enVol, setEnVol] = useState<EnVol | null>(null)
  const capteurs = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  )

  // Une lecture de case par (personne, jour), calculée une fois par rendu.
  const cases = useMemo(() => {
    const m = new Map<string, CaseMois | null>()
    for (const s of presents)
      for (const d of jours)
        m.set(`${s.id}|${d}`, caseDe(semaines, motifs, s.id, d))
    return m
  }, [presents, jours, semaines, motifs])
  const lire = (sid: number, date: string) =>
    cases.has(`${sid}|${date}`)
      ? (cases.get(`${sid}|${date}`) ?? null)
      : caseDe(semaines, motifs, sid, date)

  const horaireDe = (id: number | null) =>
    id === null ? undefined : horaires.find((h) => h.id === id)
  const couleurDe = (a: ShiftOut) =>
    couleurShift(
      horaireDe(a.type_shift_id),
      referentiel.postes.find((p) => p.id === a.poste_id),
      GRIS,
    )
  const verrouillee = (lundi: string) => !!etats.get(lundi)?.verrouillee

  const alertesDe = (sid: number): AlerteOut[] => {
    const vues = new Map<string, AlerteOut>()
    for (const l of lundis) {
      for (const a of semaines.get(l)?.bilan.find((b) => b.salarie_id === sid)
        ?.alertes ?? []) {
        vues.set(a.message, a)
      }
    }
    return [...vues.values()]
  }

  const indice = (s: Salarie, date: string): Indice => {
    if (!enVol) return null
    const c = lire(s.id, date)
    if (c?.type === 'hors') return 'deconseille'
    if (enVol.type === 'statut') {
      if (reperer(date).lundi !== enVol.lundi || c?.fixe) return 'deconseille'
      return enVol.repos && s.id !== enVol.salarieId ? 'deconseille' : 'ok'
    }
    if (c?.type === 'absence' || c?.fixe) return 'deconseille'
    const niveau = s.competences.find(
      (x) => x.poste_id === enVol.shift.poste_id,
    )?.niveau
    if (!niveau) return 'deconseille'
    return niveau === 'titulaire' ? 'ok' : 'depannage'
  }

  const debutVol = (e: DragStartEvent) => {
    const [type, id, date] = String(e.active.id).split(':')
    const { lundi, jour } = reperer(date)
    if (type === 'shift') {
      const shift = semaines
        .get(lundi)
        ?.affectations.find((a) => a.id === Number(id))
      if (shift)
        setEnVol({
          type: 'shift',
          lundi,
          date,
          shift,
          couleur: couleurDe(shift),
        })
      return
    }
    const c = lire(Number(id), date)
    if (!c || c.type === 'shift' || c.type === 'hors' || c.fixe) return
    setEnVol({
      type: 'statut',
      lundi,
      date,
      salarieId: Number(id),
      jour,
      repos: c.type === 'repos',
      nom: c.type === 'absence' ? (c.motif?.nom ?? 'Absent') : 'Repos',
    })
  }

  const finVol = (e: DragEndEvent) => {
    const vol = enVol
    setEnVol(null)
    if (!vol || !e.over) return
    const [, sid, date] = String(e.over.id).split(':')
    const copie = !!(e.activatorEvent as globalThis.MouseEvent | undefined)
      ?.altKey
    onDeposer({ vol, salarieId: Number(sid), date, copie })
  }

  const nbColonnes = jours.length + 2
  const largeurMin = 176 + jours.length * 38 + 84

  return (
    <DndContext
      // Capteurs constants : React exige une liste de même taille d'un rendu
      // à l'autre ; ce sont les cartes qui se désactivent (`actif`).
      sensors={capteurs}
      onDragStart={debutVol}
      onDragEnd={finVol}
      onDragCancel={() => setEnVol(null)}
    >
      <div
        className={cn(
          'min-h-0 flex-1 overflow-auto rounded-xl border bg-card',
          enVol && 'planning-mois-en-glisser',
        )}
      >
        <table
          className="w-full table-fixed border-separate border-spacing-0 text-sm"
          style={{ minWidth: largeurMin }}
        >
          <colgroup>
            <col style={{ width: 176 }} />
            {jours.map((d) => (
              <col key={d} />
            ))}
            <col style={{ width: 84 }} />
          </colgroup>
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky top-0 left-0 z-30 border-b border-r bg-muted px-3 text-left text-xs font-medium text-muted-foreground"
              >
                {presents.length} personne{presents.length > 1 ? 's' : ''}
              </th>
              {lundis.map((l) => {
                const dedans = jours.filter((j) => reperer(j).lundi === l)
                const etat = etats.get(l)
                const raison = etat ? raisonFermee(etat) : null
                const n = numeroSemaine(l)
                return (
                  <th
                    key={l}
                    colSpan={dedans.length}
                    className="sticky top-0 z-20 h-7 border-b border-l border-l-foreground/25 bg-muted p-0"
                  >
                    <Tip
                      label={
                        <span className="whitespace-pre-line">
                          {`Semaine ${n} : du ${dateMoyenne(l)} au ${dateMoyenne(ajouterJours(l, 6))}`}
                          {raison
                            ? `\nSemaine ${raison}`
                            : '\nOuverte : les actions du mois la touchent'}
                          {'\nCliquer pour l’ouvrir en vue semaine'}
                        </span>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => onSemaine(l)}
                        aria-label={`Ouvrir la semaine ${n}`}
                        className={cn(
                          'inline-flex h-7 w-full items-center justify-center gap-1 text-[11px] font-semibold tracking-wide hover:bg-accent hover:text-primary',
                          raison
                            ? 'text-muted-foreground/70'
                            : 'text-foreground',
                        )}
                      >
                        S{n}
                        {etat?.verrouillee && (
                          <Lock className="size-2.5" aria-label="verrouillée" />
                        )}
                      </button>
                    </Tip>
                  </th>
                )
              })}
              <th
                rowSpan={2}
                className="sticky top-0 z-20 border-b border-l bg-muted px-2 text-center text-[11px] leading-tight font-medium text-muted-foreground"
              >
                Mois
                <br />
                Heures
              </th>
            </tr>
            <tr>
              {jours.map((d) => {
                const { jour } = reperer(d)
                return (
                  <th
                    key={d}
                    className={cn(
                      'sticky top-7 z-20 border-b bg-muted py-1 text-center font-normal leading-tight',
                      jour === 0 && 'border-l border-l-foreground/25',
                      d === aujourdhui && 'bg-primary/15 text-primary',
                    )}
                  >
                    <span className="block text-[10px] text-muted-foreground">
                      {JOURS[jour][0]}
                    </span>
                    <span className="block text-xs font-medium tabular-nums">
                      {Number(d.slice(8))}
                    </span>
                    <PointsPresence
                      presence={
                        semaines
                          .get(reperer(d).lundi)
                          ?.presence.filter((p) => p.jour === jour) ?? []
                      }
                    />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {parGroupe(presents, groupes).map((g) => [
              <tr key={`g-${g.id}`}>
                <td
                  colSpan={nbColonnes}
                  className="border-b bg-muted/50 px-3 py-1 text-xs font-semibold"
                >
                  {g.nom}{' '}
                  <span className="font-normal text-muted-foreground">
                    {g.membres.length}
                  </span>
                </td>
              </tr>,
              ...g.membres.map((s) => (
                <LigneMois
                  key={`s-${s.id}`}
                  personne={s}
                  mois={mois}
                  jours={jours}
                  lire={lire}
                  alertes={alertesDe(s.id)}
                  horaireDe={horaireDe}
                  couleurDe={couleurDe}
                  verrouillee={verrouillee}
                  aujourdhui={aujourdhui}
                  glisser={glisser}
                  indice={indice}
                  onFiche={onFiche}
                  onJour={onJour}
                />
              )),
            ])}
          </tbody>
        </table>
      </div>
      <DragOverlay dropAnimation={null}>
        {enVol && (
          <div
            className={cn(
              'planning-mois-pastille grid h-8 w-10 place-items-center rounded-md text-[10px] font-semibold shadow-lg',
              enVol.type === 'statut' && 'w-auto px-2',
            )}
            style={
              {
                '--couleur': enVol.type === 'shift' ? enVol.couleur : GRIS,
              } as CSSProperties
            }
          >
            {enVol.type === 'shift' ? (
              <span className="grid leading-tight">
                <span>{heureAffichee(enVol.shift.debut)}</span>
                <span>{heureAffichee(enVol.shift.fin)}</span>
              </span>
            ) : (
              enVol.nom
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

const classesIndice: Record<Exclude<Indice, null>, string> = {
  ok: 'shadow-[inset_0_0_0_2px_rgb(16_185_129/0.6)]',
  depannage: 'shadow-[inset_0_0_0_2px_rgb(245_158_11/0.7)]',
  deconseille: 'bg-destructive/15',
}

function LigneMois({
  personne: s,
  mois,
  jours,
  lire,
  alertes,
  horaireDe,
  couleurDe,
  verrouillee,
  aujourdhui,
  glisser,
  indice,
  onFiche,
  onJour,
}: {
  personne: Salarie
  mois: string
  jours: string[]
  lire: (sid: number, date: string) => CaseMois | null
  alertes: AlerteOut[]
  horaireDe: (id: number | null) => Horaire | undefined
  couleurDe: (a: ShiftOut) => string
  verrouillee: (lundi: string) => boolean
  aujourdhui: string
  glisser: boolean
  indice: (s: Salarie, date: string) => Indice
  onFiche: (id: number) => void
  onJour: (
    sid: number,
    date: string,
    x: number,
    y: number,
    clicDroit: boolean,
  ) => void
}) {
  const nom = `${s.prenom} ${s.nom}`.trim()
  const shifts = jours
    .map((d) => lire(s.id, d))
    .filter(
      (c): c is Extract<CaseMois, { type: 'shift' }> => c?.type === 'shift',
    )
  const minutes = shifts.reduce((n, c) => n + c.shift.duree, 0)
  const loi = alertes.some((a) => a.nature === 'loi')
  const ouvrir = (date: string, clicDroit: boolean) => (e: MouseEvent) => {
    if (clicDroit) e.preventDefault()
    onJour(s.id, date, e.clientX, e.clientY, clicDroit)
  }
  const fondJour = (date: string) =>
    cn(
      date === aujourdhui && 'bg-primary/10',
      verrouillee(reperer(date).lundi) && 'planning-mois-verrouillee',
    )

  const cellules: ReactNode[] = []
  for (let k = 0; k < jours.length; k++) {
    const date = jours[k]
    const c = lire(s.id, date)
    const cle = cleBandeau(c)
    const lundiCase = reperer(date).jour === 0
    if (cle && c && c.type !== 'shift') {
      let longueur = 1
      while (
        k + longueur < jours.length &&
        cleBandeau(lire(s.id, jours[k + longueur])) === cle
      )
        longueur++
      const couverts = jours.slice(k, k + longueur)
      const Icone =
        c.type === 'absence'
          ? c.motif && estEcole(c.motif)
            ? GraduationCap
            : CalendarOff
          : c.type === 'hors'
            ? UserX
            : Coffee
      const libelle =
        c.type === 'absence'
          ? (c.motif?.nom ?? 'Absent')
          : c.type === 'hors'
            ? 'Hors contrat'
            : 'Repos'
      const couleur = c.type === 'absence' ? (c.motif?.couleur ?? GRIS) : GRIS
      const periode =
        longueur > 1
          ? `${dateLongue(couverts[0])} → ${dateLongue(couverts[longueur - 1])}`
          : dateLongue(couverts[0])
      const precision = (d: string) => {
        const x = lire(s.id, d)
        if (x?.type === 'absence')
          return x.fixe ? ' (semaine type, dans la fiche)' : ''
        if (x?.type === 'hors') return ' (arrivée ou fin de contrat)'
        return x?.fixe ? ' de la semaine type : à changer dans la fiche' : ''
      }
      cellules.push(
        <td
          key={date}
          colSpan={longueur}
          className={cn(
            'relative h-10 border-b p-0.5',
            lundiCase && 'border-l border-l-foreground/25',
          )}
        >
          {couverts.map(
            (d, i) =>
              i > 0 &&
              reperer(d).jour === 0 && (
                <span
                  key={d}
                  className="absolute inset-y-0 w-px bg-foreground/25"
                  style={{ left: `${(i / longueur) * 100}%` }}
                />
              ),
          )}
          <div className="relative z-[1] h-8">
            <div
              className={cn(
                'planning-mois-bande pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 overflow-hidden rounded-md px-1 text-[10.5px] font-medium text-muted-foreground',
                c.type === 'hors' && 'planning-mois-hors',
                c.type === 'repos' && 'planning-mois-repos',
                longueur === 1 && 'flex-col gap-0 text-[10px] leading-none',
              )}
              style={{ '--couleur': couleur } as CSSProperties}
            >
              <Icone className={longueur === 1 ? 'size-3' : 'size-3.5'} />
              <span className="truncate">{libelle}</span>
            </div>
            <div className="absolute inset-0 flex">
              {couverts.map((d) => (
                <Segment
                  key={d}
                  idDepot={`case:${s.id}:${d}`}
                  idGlisser={`statut:${s.id}:${d}`}
                  actif={
                    glisser &&
                    !verrouillee(reperer(d).lundi) &&
                    !lire(s.id, d)?.fixe
                  }
                  indice={indice(s, d)}
                  classe={fondJour(d)}
                  tip={`${periode} · ${libelle}${precision(d)}\n${glisser ? 'Cliquer pour modifier ce jour' : 'Cliquer pour ouvrir la semaine'}`}
                  etiquette={`${nom}, ${dateLongue(d)} : ${libelle}${precision(d)}`}
                  onClick={ouvrir(d, false)}
                  onMenu={ouvrir(d, true)}
                />
              ))}
            </div>
          </div>
        </td>,
      )
      k += longueur - 1
      continue
    }

    const shift = c?.type === 'shift' ? c.shift : undefined
    const h = shift ? horaireDe(shift.type_shift_id) : undefined
    const quand = dateLongue(date)
    const resume = shift
      ? `${quand} · ${h ? `${h.code} · ${h.nom}` : 'Horaire spécifique'} ${heureAffichee(shift.debut)}–${heureAffichee(shift.fin)}${s.forfait_jours ? '' : ` · ${heures(shift.duree)}`} · ${shift.epinglee ? 'validé' : 'proposition'}`
      : `${quand} · Non attribué`
    const alertesShift = shift?.alertes ?? []
    cellules.push(
      <CaseJour
        key={date}
        idDepot={`case:${s.id}:${date}`}
        classe={cn(
          lundiCase && 'border-l border-l-foreground/25',
          fondJour(date),
        )}
        indice={indice(s, date)}
        onMenu={ouvrir(date, true)}
      >
        <Pastille
          idGlisser={
            shift ? `shift:${shift.id}:${date}` : `statut:${s.id}:${date}`
          }
          actif={glisser && !!shift && !verrouillee(reperer(date).lundi)}
          couleur={shift ? couleurDe(shift) : GRIS}
          classe={cn(
            shift && 'planning-mois-pastille',
            shift && !shift.epinglee && 'planning-mois-proposition',
            alertesShift.some((a) => a.nature === 'loi') &&
              'planning-mois-infraction',
          )}
          tip={`${resume}${alertesShift.map((a) => `\n⚠ ${a.message}`).join('')}\n${glisser ? 'Cliquer pour modifier' : 'Cliquer pour ouvrir la semaine'}`}
          etiquette={`${nom}, ${resume}${alertesShift.length ? `, ${alertesShift.length} alerte(s)` : ''}`}
          onClick={ouvrir(date, false)}
        >
          {shift && (
            // Début et fin en entier (« 08 » se lisait comme « 8 heures »),
            // l'un sous l'autre au centre ; l'étoile au centre de la marge
            // gauche, pour que les horaires restent alignés d'une case à
            // l'autre.
            <span className="grid w-full grid-cols-[1fr_auto_1fr] items-center text-[9.5px] leading-[1.15] font-semibold tabular-nums">
              <span className="grid place-items-center">
                {journeeEtoile(s, shift) && (
                  <Star
                    className="size-2.5 fill-amber-400 text-amber-400"
                    aria-label="journée étoile"
                  />
                )}
              </span>
              <span
                className="grid justify-items-end"
                style={h?.code_rouge ? { color: ROUGE_CODE } : undefined}
              >
                <span>{heureAffichee(shift.debut)}</span>
                <span className="opacity-80">{heureAffichee(shift.fin)}</span>
              </span>
              <span />
            </span>
          )}
        </Pastille>
      </CaseJour>,
    )
  }

  return (
    <tr className="group/ligne">
      <td className="sticky left-0 z-10 border-r border-b bg-card p-0 group-hover/ligne:bg-muted">
        <Tip
          label={
            <span className="whitespace-pre-line">
              {[
                'Ouvrir la fiche',
                ...alertes.map((a) => `⚠ ${a.message}`),
              ].join('\n')}
            </span>
          }
        >
          <button
            type="button"
            onClick={() => onFiche(s.id)}
            className="flex h-10 w-full items-center gap-1.5 truncate px-3 text-left text-xs font-semibold hover:text-primary"
          >
            <span className="truncate">{nom}</span>
            {alertes.length > 0 && (
              <TriangleAlert
                className={cn(
                  'size-3 shrink-0',
                  loi ? 'text-destructive' : 'text-amber-500',
                )}
                aria-label={`${alertes.length} alerte(s)`}
              />
            )}
          </button>
        </Tip>
      </td>
      {cellules}
      <td className="border-b border-l px-2 text-center text-xs tabular-nums">
        {s.forfait_jours ? (
          <Tip label="Forfait jours : journées travaillées dans le mois">
            <span tabIndex={0}>
              <strong>{shifts.length} j</strong>
              <span className="text-muted-foreground"> · forfait</span>
            </span>
          </Tip>
        ) : (
          <strong data-mois={mois}>{heures(minutes)}</strong>
        )}
      </td>
    </tr>
  )
}

function CaseJour({
  idDepot,
  classe,
  indice,
  onMenu,
  children,
}: {
  idDepot: string
  classe: string
  indice: Indice
  onMenu: (e: MouseEvent) => void
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: idDepot })
  return (
    <td
      ref={setNodeRef}
      className={cn(
        'h-10 border-b p-0.5',
        classe,
        indice && classesIndice[indice],
        isOver && 'bg-primary/20',
      )}
      onContextMenu={onMenu}
    >
      {children}
    </td>
  )
}

function Pastille({
  idGlisser,
  actif,
  couleur,
  classe,
  tip,
  etiquette,
  onClick,
  children,
}: {
  idGlisser: string
  actif: boolean
  couleur: string
  classe: string
  tip: string
  etiquette: string
  onClick: (e: MouseEvent) => void
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: idGlisser,
    disabled: !actif,
  })
  return (
    <Tip label={<span className="whitespace-pre-line">{tip}</span>}>
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={etiquette}
        onClick={onClick}
        style={{ '--couleur': couleur } as CSSProperties}
        className={cn(
          'grid h-8 w-full touch-manipulation place-items-center rounded-md border border-transparent select-none hover:bg-accent/60',
          !actif && 'cursor-pointer',
          classe,
          isDragging && 'opacity-35',
        )}
      >
        {children}
      </button>
    </Tip>
  )
}

function Segment({
  idDepot,
  idGlisser,
  actif,
  indice,
  classe,
  tip,
  etiquette,
  onClick,
  onMenu,
}: {
  idDepot: string
  idGlisser: string
  actif: boolean
  indice: Indice
  classe: string
  tip: string
  etiquette: string
  onClick: (e: MouseEvent) => void
  onMenu: (e: MouseEvent) => void
}) {
  const depot = useDroppable({ id: idDepot })
  const saisie = useDraggable({ id: idGlisser, disabled: !actif })
  return (
    <Tip label={<span className="whitespace-pre-line">{tip}</span>}>
      <button
        ref={(n) => {
          depot.setNodeRef(n)
          saisie.setNodeRef(n)
        }}
        type="button"
        {...saisie.attributes}
        {...saisie.listeners}
        aria-label={etiquette}
        onClick={onClick}
        onContextMenu={onMenu}
        className={cn(
          'min-w-0 flex-1 touch-manipulation rounded-md select-none hover:bg-primary/10 hover:shadow-[inset_0_0_0_1px_var(--color-primary)]',
          classe,
          indice && classesIndice[indice],
          depot.isOver && 'bg-primary/20',
        )}
      />
    </Tip>
  )
}

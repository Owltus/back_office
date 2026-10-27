/*
 * Bloc École de la fiche : calendrier JOUR PAR JOUR sur l'année scolaire
 * (décision utilisateur du 2026-10-27 : une période peut être une semaine,
 * quelques jours ou un samedi, et le calendrier change en cours d'année).
 * Un clic pose ou retire un jour, glisser à la souris en prend plusieurs, le
 * numéro de semaine prend du lundi au vendredi, et « Dates du CFA » lit le
 * document de l'école. Tout est rangé en jours d'absence du motif école :
 * le moteur ne planifie jamais la personne ces jours-là, et un shift déjà
 * posé sur un nouveau jour d'école est retiré à l'enregistrement (signalé
 * ici avant).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as EvenementPointeur } from 'react'

import {
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  GraduationCap,
} from 'lucide-react'

import { DatesCfaDialog } from '#/components/planning/parametres/equipe/DatesCfaDialog.tsx'
import type { PeriodeBrouillon } from '#/components/planning/parametres/equipe/brouillon.ts'
import {
  anneeScolaire,
  avecJoursEcole,
  basculerJourEcole,
  basculerSemaine,
  dateLongue,
  dateShift,
  ecoleFixe,
  etatSemaine,
  joursEcole,
  moisEntre,
  peindre,
  periodeTexte,
  plage,
  prochainePeriode,
  shiftsSurEcole,
} from '#/components/planning/parametres/equipe/ecole.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { numeroSemaine, texteSur } from '#/lib/planning/affichage.ts'
import { lundiDe } from '#/lib/planning/temps.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type {
  Affectation,
  JourType,
  Motif,
  Poste,
} from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

const INITIALES = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const MOIS = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const nomMois = (mois: string) => MOIS.format(new Date(`${mois}-15T12:00:00Z`))

interface Trace {
  depart: string
  ecole: boolean
  avant: Set<string>
}

export function CalendrierEcole({
  ecole,
  absences,
  semaineType,
  onAbsences,
  onSemaineType,
  aujourdhui,
  disabled,
  verrous,
  joursAvant,
  shifts,
  postes,
}: {
  ecole: Motif
  absences: PeriodeBrouillon[]
  semaineType: JourType[]
  onAbsences: (a: PeriodeBrouillon[]) => void
  onSemaineType: (s: JourType[]) => void
  aujourdhui: string
  disabled?: boolean
  /** Semaines verrouillées : leurs jours ne changent pas. */
  verrous: string[]
  /** Jours d'école à l'ouverture de la fiche. */
  joursAvant: Set<string>
  /** Shifts déjà posés pour cette personne. */
  shifts: Affectation[]
  postes: Poste[]
}) {
  const [annee, setAnnee] = useState(() => anneeScolaire(aujourdhui).debut)
  const [cfa, setCfa] = useState(false)
  const { debut, fin } = anneeScolaire(annee)
  const mois = useMemo(() => moisEntre(debut, fin), [debut, fin])
  const jours = joursEcole(absences, ecole.id)
  const verrouille = (j: string) => verrous.includes(lundiDe(j))
  const modifiable = (j: string) => !verrouille(j)
  const enregistrer = (j: Set<string>) =>
    onAbsences(avecJoursEcole(absences, ecole.id, j))

  // Glisser à la souris : la plage depuis le premier jour, appliquée sur
  // l'état d'avant le glisser (revenir en arrière la défait).
  const trace = useRef<Trace | null>(null)
  const parSouris = useRef(false)
  useEffect(() => {
    const terminer = () => {
      trace.current = null
    }
    window.addEventListener('pointerup', terminer)
    window.addEventListener('pointercancel', terminer)
    return () => {
      window.removeEventListener('pointerup', terminer)
      window.removeEventListener('pointercancel', terminer)
    }
  }, [])
  const commencer = (e: EvenementPointeur, j: string) => {
    if (disabled || e.pointerType !== 'mouse' || e.button !== 0) return
    e.preventDefault()
    parSouris.current = true
    trace.current = { depart: j, ecole: !jours.has(j), avant: jours }
    enregistrer(peindre(jours, [j], !jours.has(j), modifiable))
  }
  const etendre = (j: string) => {
    const t = trace.current
    if (!t) return
    enregistrer(peindre(t.avant, plage(t.depart, j), t.ecole, modifiable))
  }
  const cliquer = (j: string) => {
    // Le clic qui suit un appui à la souris est déjà traité.
    if (parSouris.current) {
      parSouris.current = false
      return
    }
    enregistrer(peindre(jours, [j], !jours.has(j), modifiable))
  }

  const dansAnnee = [...jours].filter((j) => j >= debut && j <= fin)
  const prochaine = prochainePeriode(jours, aujourdhui)
  const retires = shiftsSurEcole(shifts, joursAvant, jours).filter((s) =>
    modifiable(dateShift(s)),
  )
  const retiresLe = new Set(retires.map(dateShift))
  const nomPoste = (id: number) => postes.find((p) => p.id === id)?.nom ?? ''

  return (
    <section
      className="planning-ecole flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3"
      style={
        {
          '--planning-ecole': ecole.couleur,
          '--planning-ecole-texte': texteSur(ecole.couleur),
        } as CSSProperties
      }
      aria-label="École"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <GraduationCap className="size-4" /> École
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setCfa(true)}
        >
          <ClipboardPaste /> Dates du CFA
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Cliquez sur ses jours d'école, ou glissez pour en prendre plusieurs. Le
        numéro de semaine prend du lundi au vendredi. Le moteur ne la planifie
        jamais ces jours-là.
      </p>
      <p className="text-xs">
        {prochaine ? (
          <>
            {prochaine.debut <= aujourdhui ? 'À l’école' : 'Prochaine école'} :{' '}
            {periodeTexte(prochaine)}.
          </>
        ) : (
          <span className="text-muted-foreground">
            Aucun jour d'école à venir.
          </span>
        )}
      </p>

      {retires.length > 0 && (
        <div
          role="status"
          className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs"
        >
          <p className="font-medium">
            {retires.length > 1
              ? `${retires.length} shifts déjà posés tombent sur l'école : ils seront retirés à l'enregistrement.`
              : "1 shift déjà posé tombe sur l'école : il sera retiré à l'enregistrement."}
          </p>
          <ul className="mt-1 text-muted-foreground">
            {retires.slice(0, 6).map((s) => (
              <li key={s.id}>
                {dateLongue(dateShift(s))} · {nomPoste(s.poste_id)} {s.debut}-
                {s.fin}
              </li>
            ))}
            {retires.length > 6 && <li>et {retires.length - 6} autres</li>}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Année scolaire précédente"
          onClick={() => setAnnee(`${Number(debut.slice(0, 4)) - 1}-09-01`)}
        >
          <ChevronLeft />
        </Button>
        <span className="text-xs font-medium">
          Année {debut.slice(0, 4)}-{fin.slice(0, 4)}
          <span className="ml-2 font-normal text-muted-foreground">
            {dansAnnee.length > 1
              ? `${dansAnnee.length} jours d'école`
              : `${dansAnnee.length} jour d'école`}
          </span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Année scolaire suivante"
          onClick={() => setAnnee(`${Number(debut.slice(0, 4)) + 1}-09-01`)}
        >
          <ChevronRight />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-3 select-none min-[480px]:grid-cols-2 sm:grid-cols-3">
        {mois.map((m) => (
          <div key={m.mois} className="flex flex-col gap-0.5">
            <span className="text-xs font-medium capitalize">
              {nomMois(m.mois)}
            </span>
            <div className="grid grid-cols-[1.75rem_repeat(7,minmax(0,1fr))] gap-0.5 text-[10px] text-muted-foreground">
              <span />
              {INITIALES.map((l, i) => (
                <span key={i} className="text-center">
                  {l}
                </span>
              ))}
            </div>
            {m.semaines.map((s) => {
              const etat = etatSemaine(jours, s.lundi)
              const fermee = verrouille(s.lundi)
              return (
                <div
                  key={s.lundi}
                  className="grid grid-cols-[1.75rem_repeat(7,minmax(0,1fr))] gap-0.5"
                >
                  <Tip
                    label={
                      fermee
                        ? 'Semaine verrouillée'
                        : etat === 'ecole'
                          ? 'Remettre la semaine à l’hôtel'
                          : 'École du lundi au vendredi'
                    }
                  >
                    <button
                      type="button"
                      disabled={disabled || fermee}
                      aria-label={`Semaine ${numeroSemaine(s.lundi)} : école du lundi au vendredi`}
                      aria-pressed={etat === 'ecole'}
                      onClick={() =>
                        enregistrer(basculerSemaine(jours, s.lundi, modifiable))
                      }
                      className="h-6 rounded text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent"
                    >
                      S{numeroSemaine(s.lundi)}
                    </button>
                  </Tip>
                  {s.jours.map((j, i) =>
                    j === null ? (
                      <span key={i} />
                    ) : (
                      <JourEcole
                        key={j}
                        jour={j}
                        ecole={jours.has(j)}
                        weekend={i >= 5}
                        aujourdhui={j === aujourdhui}
                        verrouille={fermee}
                        retire={retiresLe.has(j)}
                        disabled={disabled}
                        onPointerDown={(e) => commencer(e, j)}
                        onPointerEnter={() => etendre(j)}
                        onClick={() => cliquer(j)}
                      />
                    ),
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <span className="text-xs font-medium">
          Jour de cours fixe{' '}
          <span className="font-normal text-muted-foreground">
            école ce jour-là toutes les semaines, en plus du calendrier
          </span>
        </span>
        <div className="flex flex-wrap gap-1">
          {INITIALES.map((l, j) => {
            const fixe = ecoleFixe(semaineType, j, ecole.id)
            return (
              <Tip
                key={j}
                label={
                  fixe
                    ? 'École ce jour-là, toutes les semaines'
                    : "Pas d'école fixe ce jour-là"
                }
              >
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={fixe}
                  aria-label={`École le ${JOURS[j].toLowerCase()}, toutes les semaines`}
                  onClick={() =>
                    onSemaineType(basculerJourEcole(semaineType, j, ecole.id))
                  }
                  className={cn(
                    'size-8 rounded-md border border-border text-xs font-semibold disabled:opacity-60',
                    fixe
                      ? 'planning-ecole-plein'
                      : 'bg-background hover:bg-accent',
                  )}
                >
                  {l}
                </button>
              </Tip>
            )
          })}
        </div>
      </div>

      <DatesCfaDialog
        ouvert={cfa}
        onFermer={() => setCfa(false)}
        jours={jours}
        aujourdhui={aujourdhui}
        modifiable={modifiable}
        onAppliquer={enregistrer}
      />
    </section>
  )
}

function JourEcole({
  jour,
  ecole,
  weekend,
  aujourdhui,
  verrouille,
  retire,
  disabled,
  onPointerDown,
  onPointerEnter,
  onClick,
}: {
  jour: string
  ecole: boolean
  weekend: boolean
  aujourdhui: boolean
  verrouille: boolean
  retire: boolean
  disabled?: boolean
  onPointerDown: (e: EvenementPointeur) => void
  onPointerEnter: () => void
  onClick: () => void
}) {
  const texte = `${dateLongue(jour)} : ${ecole ? 'école' : "à l'hôtel"}${
    verrouille ? ', semaine verrouillée' : ''
  }${retire ? ', son shift sera retiré' : ''}`
  return (
    <button
      type="button"
      disabled={disabled || verrouille}
      aria-pressed={ecole}
      aria-label={texte}
      title={texte}
      data-ecole={ecole || undefined}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onClick={onClick}
      className={cn(
        'relative h-6 rounded text-[11px] tabular-nums disabled:cursor-not-allowed disabled:opacity-50',
        ecole
          ? 'planning-ecole-plein font-semibold'
          : cn('hover:bg-accent', weekend && 'text-muted-foreground'),
        aujourdhui && 'ring-1 ring-foreground ring-inset',
      )}
    >
      {Number(jour.slice(8))}
      {retire && (
        <span
          aria-hidden
          className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-amber-500"
        />
      )}
    </button>
  )
}

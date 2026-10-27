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
  Undo2,
} from 'lucide-react'

import { DatesCfaDialog } from '#/components/planning/parametres/equipe/DatesCfaDialog.tsx'
import type { PeriodeBrouillon } from '#/components/planning/parametres/equipe/brouillon.ts'
import {
  anneeScolaire,
  appliquerPlage,
  avecJoursEcole,
  basculerJourEcole,
  basculerSemaine,
  dateLongue,
  dateShift,
  ecart,
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

interface Geste {
  depart: string
  courant: string
  /** Vrai : la plage passe à l'école ; faux : elle revient à l'hôtel. */
  ecole: boolean
}

/** Ce que fera le geste en cours, en clair. */
function resumer(g: Geste, n: number): string {
  const [debut, fin] =
    g.depart <= g.courant ? [g.depart, g.courant] : [g.courant, g.depart]
  const quoi =
    n === 0
      ? 'aucun jour ne change'
      : g.ecole
        ? n > 1
          ? `${n} jours passent à l'école`
          : "1 jour passe à l'école"
        : n > 1
          ? `${n} jours reviennent à l'hôtel`
          : "1 jour revient à l'hôtel"
  return `${periodeTexte({ debut, fin })} : ${quoi}. Relâchez pour valider, Échap pour abandonner.`
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

  // Chaque changement garde l'état d'avant : « Défaire » le défait (une
  // mauvaise manipulation se rattrape sans tout refaire).
  const [historique, setHistorique] = useState<Array<Set<string>>>([])
  const changer = (suite: Set<string>) => {
    if (!ecart(jours, suite)) return
    setHistorique((h) => [...h.slice(-29), jours])
    enregistrer(suite)
  }
  const annuler = () => {
    const precedent = historique.at(-1)
    if (!precedent) return
    setHistorique((h) => h.slice(0, -1))
    enregistrer(precedent)
  }

  // Plage d'un geste : appuyer sur un jour, relâcher sur un autre (même
  // dans un autre mois, dans un sens ou dans l'autre). Partir d'un jour
  // d'école la retire. Aperçu pendant le geste, appliqué au relâcher ;
  // Échap l'abandonne.
  const [geste, setGeste] = useState<Geste | null>(null)
  const apercu = geste
    ? appliquerPlage(
        jours,
        geste.depart,
        geste.courant,
        geste.ecole,
        modifiable,
      )
    : jours
  const dansGeste = new Set(geste ? plage(geste.depart, geste.courant) : [])
  const appliquer = useRef<() => void>(() => undefined)
  appliquer.current = () => {
    if (!geste) return
    changer(apercu)
    setGeste(null)
  }
  const enGeste = geste !== null
  useEffect(() => {
    if (!enGeste) return
    const relacher = () => appliquer.current()
    const abandonner = () => setGeste(null)
    const clavier = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      abandonner()
    }
    window.addEventListener('pointerup', relacher)
    window.addEventListener('pointercancel', abandonner)
    // En capture : Échap pendant un geste ne ferme pas la fiche.
    window.addEventListener('keydown', clavier, true)
    return () => {
      window.removeEventListener('pointerup', relacher)
      window.removeEventListener('pointercancel', abandonner)
      window.removeEventListener('keydown', clavier, true)
    }
  }, [enGeste])
  // Dernier jour touché : Maj + clic prend la plage depuis lui.
  const ancre = useRef<string | null>(null)
  // Dernier pointeur appuyé : un clic de souris est déjà traité à l'appui.
  const pointeur = useRef('')
  const commencer = (e: EvenementPointeur, j: string) => {
    pointeur.current = e.pointerType
    if (disabled || e.pointerType !== 'mouse' || e.button !== 0) return
    e.preventDefault()
    if (e.shiftKey && ancre.current) {
      changer(
        appliquerPlage(jours, ancre.current, j, !jours.has(j), modifiable),
      )
    } else {
      setGeste({ depart: j, courant: j, ecole: !jours.has(j) })
    }
    ancre.current = j
  }
  const etendre = (j: string) => {
    if (geste && geste.courant !== j) setGeste({ ...geste, courant: j })
  }
  const cliquer = (j: string, maj: boolean, pointe: boolean) => {
    // Un clic de souris (pointé, pas le clavier) est déjà traité à l'appui.
    if (pointe && pointeur.current === 'mouse') return
    // Clavier ou doigt.
    changer(
      maj && ancre.current
        ? appliquerPlage(jours, ancre.current, j, !jours.has(j), modifiable)
        : peindre(jours, [j], !jours.has(j), modifiable),
    )
    ancre.current = j
  }
  const resumeGeste = geste ? resumer(geste, ecart(jours, apercu)) : null

  const dansAnnee = [...apercu].filter((j) => j >= debut && j <= fin)
  const prochaine = prochainePeriode(jours, aujourdhui)
  const retires = shiftsSurEcole(shifts, joursAvant, jours).filter((s) =>
    modifiable(dateShift(s)),
  )
  const retiresLe = new Set(retires.map(dateShift))
  const nomPoste = (id: number) => postes.find((p) => p.id === id)?.nom ?? ''

  return (
    <section
      data-partie="École"
      className="planning-ecole flex scroll-mt-12 flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3"
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
        Un clic pose ou retire un jour. Pour une plage, appuyez sur le premier
        jour et relâchez sur le dernier, même dans un autre mois : le week-end
        n'est pris que si vous le visez. Partir d'un jour d'école retire la
        plage. Le numéro de semaine prend du lundi au vendredi.
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
        <span className="flex flex-wrap items-center justify-center gap-x-2 text-xs font-medium">
          Année {debut.slice(0, 4)}-{fin.slice(0, 4)}
          <span className="font-normal text-muted-foreground">
            {dansAnnee.length > 1
              ? `${dansAnnee.length} jours d'école`
              : `${dansAnnee.length} jour d'école`}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={disabled || !historique.length}
            onClick={annuler}
            aria-label="Défaire le dernier changement du calendrier"
          >
            <Undo2 /> Défaire
          </Button>
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

      <p
        className="min-h-4 text-xs font-medium text-primary"
        aria-live="polite"
      >
        {resumeGeste}
      </p>

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
              const etat = etatSemaine(apercu, s.lundi)
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
                        changer(basculerSemaine(jours, s.lundi, modifiable))
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
                        ecole={apercu.has(j)}
                        dansGeste={dansGeste.has(j)}
                        weekend={i >= 5}
                        aujourdhui={j === aujourdhui}
                        verrouille={fermee}
                        retire={retiresLe.has(j)}
                        disabled={disabled}
                        onPointerDown={(e) => commencer(e, j)}
                        onPointerEnter={() => etendre(j)}
                        onClick={(maj, pointe) => cliquer(j, maj, pointe)}
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
        onAppliquer={changer}
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
  dansGeste,
  disabled,
  onPointerDown,
  onPointerEnter,
  onClick,
}: {
  jour: string
  ecole: boolean
  dansGeste: boolean
  weekend: boolean
  aujourdhui: boolean
  verrouille: boolean
  retire: boolean
  disabled?: boolean
  onPointerDown: (e: EvenementPointeur) => void
  onPointerEnter: () => void
  /** `pointe` : clic d'un pointeur (souris, doigt), pas du clavier. */
  onClick: (maj: boolean, pointe: boolean) => void
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
      onClick={(e) => onClick(e.shiftKey, e.detail > 0)}
      className={cn(
        'relative h-6 rounded text-[11px] tabular-nums disabled:cursor-not-allowed disabled:opacity-50',
        ecole
          ? 'planning-ecole-plein font-semibold'
          : cn('hover:bg-accent', weekend && 'text-muted-foreground'),
        aujourdhui && 'ring-1 ring-foreground ring-inset',
        dansGeste && 'ring-2 ring-primary ring-inset',
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

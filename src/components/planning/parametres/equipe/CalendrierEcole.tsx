/*
 * Bloc École de la fiche (prototype `CalendrierEcole.tsx`) : jours d'école
 * de chaque semaine (semaine type), semaines d'école sur six mois, et
 * remplissage par rythme. Tout est rangé en jours d'absence du motif école :
 * le moteur ne planifie jamais la personne ces jours-là.
 */

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { GraduationCap, Wand2 } from 'lucide-react'

import type { PeriodeBrouillon } from '#/components/planning/parametres/equipe/brouillon.ts'
import {
  appliquerRythme,
  avecJoursEcole,
  basculerJourEcole,
  basculerSemaine,
  ecoleFixe,
  etatSemaine,
  joursEcole,
  lundisEcole,
  SEMAINES_ECOLE,
} from '#/components/planning/parametres/equipe/ecole.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { numeroSemaine, texteSur } from '#/lib/planning/affichage.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type { JourType, Motif } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

const INITIALES = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MOIS = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const JOUR_MOIS = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const date = (iso: string) => new Date(`${iso}T12:00:00Z`)

export function CalendrierEcole({
  ecole,
  absences,
  semaineType,
  onAbsences,
  onSemaineType,
  aujourdhui,
  disabled,
}: {
  ecole: Motif
  absences: PeriodeBrouillon[]
  semaineType: JourType[]
  onAbsences: (a: PeriodeBrouillon[]) => void
  onSemaineType: (s: JourType[]) => void
  aujourdhui: string
  disabled?: boolean
}) {
  const lundis = useMemo(() => lundisEcole(aujourdhui), [aujourdhui])
  const [rythme, setRythme] = useState({
    ecole: 1,
    hotel: 2,
    depart: lundis[0],
  })
  const jours = joursEcole(absences, ecole.id)
  const enregistrer = (j: Set<string>) =>
    onAbsences(avecJoursEcole(absences, ecole.id, j))

  const parMois = new Map<string, string[]>()
  for (const l of lundis) {
    const mois = MOIS.format(date(l))
    parMois.set(mois, [...(parMois.get(mois) ?? []), l])
  }
  const nbEcole = lundis.filter((l) => etatSemaine(jours, l) === 'ecole').length

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
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <GraduationCap className="size-4" /> École
      </h3>
      <p className="text-xs text-muted-foreground">
        Cliquez sur ses jours d'école. Le moteur ne la planifie jamais ces
        jours-là et la remplit les autres jours.
      </p>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">Chaque semaine</span>
        <div className="flex flex-wrap gap-1">
          {INITIALES.map((l, j) => {
            const fixe = ecoleFixe(semaineType, j, ecole.id)
            return (
              <Tip
                key={j}
                label={
                  fixe
                    ? 'École ce jour-là, toutes les semaines'
                    : "Pas d'école ce jour-là"
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

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">
          Semaines d'école, du lundi au vendredi{' '}
          <span className="font-normal text-muted-foreground">
            {nbEcole} sur {SEMAINES_ECOLE} à l'école
          </span>
        </span>
        <div className="flex flex-col gap-2">
          {[...parMois].map(([mois, semaines]) => (
            <div key={mois} className="flex flex-wrap items-center gap-1">
              <span className="w-28 shrink-0 text-xs text-muted-foreground capitalize">
                {mois}
              </span>
              {semaines.map((l) => {
                const etat = etatSemaine(jours, l)
                const texte =
                  etat === 'ecole'
                    ? 'école'
                    : etat === 'partielle'
                      ? "quelques jours d'école"
                      : "à l'hôtel"
                return (
                  <Tip
                    key={l}
                    label={`Semaine du ${JOUR_MOIS.format(date(l))} : ${texte}`}
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      data-etat={etat || 'hotel'}
                      aria-pressed={etat === 'ecole'}
                      aria-label={`Semaine ${numeroSemaine(l)} du ${JOUR_MOIS.format(date(l))} : ${texte}`}
                      onClick={() => enregistrer(basculerSemaine(jours, l))}
                      className={cn(
                        'flex w-14 flex-col items-center rounded-md border border-border px-1 py-0.5 leading-tight disabled:opacity-60',
                        etat === 'ecole' && 'planning-ecole-plein',
                        etat === 'partielle' && 'planning-ecole-partiel',
                        etat === '' && 'bg-background hover:bg-accent',
                      )}
                    >
                      <strong className="text-xs">S{numeroSemaine(l)}</strong>
                      <small className="text-[10px] opacity-80">
                        {JOUR_MOIS.format(date(l))}
                      </small>
                    </button>
                  </Tip>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Wand2 className="size-4 text-muted-foreground" />
        <Input
          type="number"
          min={1}
          max={8}
          value={rythme.ecole}
          disabled={disabled}
          aria-label="Semaines d'école"
          className="h-8 w-16"
          onChange={(e) =>
            setRythme({
              ...rythme,
              ecole: Math.min(8, Math.max(1, Number(e.target.value) || 1)),
            })
          }
        />
        sem. d'école, puis
        <Input
          type="number"
          min={0}
          max={12}
          value={rythme.hotel}
          disabled={disabled}
          aria-label="Semaines à l'hôtel"
          className="h-8 w-16"
          onChange={(e) =>
            setRythme({
              ...rythme,
              hotel: Math.min(12, Math.max(0, Number(e.target.value) || 0)),
            })
          }
        />
        à l'hôtel, dès la
        <Select
          value={rythme.depart}
          disabled={disabled}
          onValueChange={(depart) => setRythme({ ...rythme, depart })}
        >
          <SelectTrigger
            size="sm"
            className="w-40"
            aria-label="Première semaine d'école"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {lundis.map((l) => (
              <SelectItem key={l} value={l}>
                S{numeroSemaine(l)} ({JOUR_MOIS.format(date(l))})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => enregistrer(appliquerRythme(jours, lundis, rythme))}
        >
          Remplir
        </Button>
      </div>
    </section>
  )
}

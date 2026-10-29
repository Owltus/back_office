/*
 * Section « Données à ranger » du volet À vérifier (plan
 * `planning-coherence-2026-10-28`, étape 11, D8 = A) : les shifts déjà posés
 * qui contredisent les réglages (`donneesARanger`), une ligne par groupe,
 * dates dépliables, et la correction proposée quand il n'y en a qu'une.
 * Rien ne s'écrit sans le clic : le bouton ouvre d'abord un aperçu de ce qui
 * sera modifié, puis Confirmer écrit (UNE requête, `rangerShifts`).
 *
 * Relecture bornée : les six derniers mois (`SEMAINES_RELUES`) et tout ce
 * qui est déjà posé ensuite. La requête part APRÈS le référentiel (seconde
 * vague) ; clé `['planning', 'a-ranger', lundi]`, jamais sur disque.
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Loader2 } from 'lucide-react'

import {
  useAujourdhui,
  useDroitsPlanning,
  useEcriture,
  useReferentiel,
} from '#/components/planning/hooks/usePlanning.ts'
import { Button } from '#/components/ui/button.tsx'
import type { LienReglage } from '#/lib/planning/coherence.ts'
import {
  dateShift,
  debutRelecture,
  donneesARanger,
} from '#/lib/planning/donneesARanger.ts'
import type { GroupeARanger, ShiftLu } from '#/lib/planning/donneesARanger.ts'
import { planningKeys } from '#/lib/planning/keys.ts'
import {
  fetchShiftsDepuis,
  rangerShifts,
} from '#/lib/planning/serviceRangement.ts'
import { jourDeLaSemaine } from '#/lib/planning/temps.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type { Salarie } from '#/lib/planning/types.ts'

/** Les groupes à ranger, une fois le référentiel lu. `groupes` null tant que
 * rien n'est lu (jamais « rien à ranger » pendant un chargement). */
export function useDonneesARanger() {
  const ref = useReferentiel()
  const droits = useDroitsPlanning()
  const depuis = debutRelecture(useAujourdhui())
  const shifts = useQuery({
    queryKey: planningKeys.aRanger(depuis),
    queryFn: () => fetchShiftsDepuis(depuis),
    enabled: Boolean(ref.data) && droits.lire,
    // Même seuil que le référentiel.
    staleTime: 60_000,
  })
  const groupes = useMemo(
    () =>
      ref.data && shifts.data ? donneesARanger(ref.data, shifts.data) : null,
    [ref.data, shifts.data],
  )
  const ecrire = useEcriture()
  /** Écrit la correction d'un groupe (shifts hors semaine verrouillée), puis
   * tout le planning est relu. Rend le message d'échec, ou null. */
  const corriger = async (g: GroupeARanger): Promise<string | null> => {
    const correction = g.correction
    if (!correction) return null
    const r = await ecrire(
      () =>
        rangerShifts(
          g.shifts.map((s) => s.id),
          correction,
        ),
      'Correction impossible',
    )
    return r.ok ? null : (r.message ?? 'Correction impossible.')
  }
  return {
    corriger,
    groupes,
    depuis,
    salaries: ref.data?.salaries ?? [],
    isPending: ref.isPending || shifts.isPending,
    isError: shifts.isError,
    peutCorriger: droits.ecrire,
  }
}

/** « lun. 03/11/26 ». */
export function dateLisible(iso: string): string {
  const [a, m, j] = iso.split('-')
  const jour = JOURS[jourDeLaSemaine(iso)].slice(0, 3).toLowerCase()
  return `${jour}. ${j}/${m}/${a.slice(2)}`
}

const nShifts = (n: number) => `${n} shift${n > 1 ? 's' : ''}`

export function SectionDonneesARanger({
  groupes,
  depuis,
  salaries,
  isPending,
  isError,
  peutCorriger,
  onAller,
  onCorriger,
}: {
  groupes: GroupeARanger[] | null
  depuis: string
  salaries: readonly Pick<Salarie, 'id' | 'prenom'>[]
  isPending: boolean
  isError: boolean
  peutCorriger: boolean
  onAller: (lien: LienReglage) => void
  /** Écrit la correction ; rend un message d'échec, ou null. */
  onCorriger: (g: GroupeARanger) => Promise<string | null>
}) {
  const prenoms = useMemo(
    () => new Map(salaries.map((s) => [s.id, s.prenom])),
    [salaries],
  )
  const [a, m, j] = depuis.split('-')
  const plage = `Shifts relus depuis le ${j}/${m}/${a}, et tout ce qui est déjà posé ensuite.`
  let corps
  if (isError) {
    corps = (
      <p className="text-sm text-destructive">
        Lecture des shifts impossible. Rouvrez ce volet dans un instant.
      </p>
    )
  } else if (isPending || !groupes) {
    corps = (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Lecture des shifts…
      </p>
    )
  } else if (!groupes.length) {
    corps = (
      <p className="text-sm text-muted-foreground">
        Aucun shift ne contredit les réglages.
      </p>
    )
  } else {
    corps = (
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {groupes.map((g) => (
          <LigneGroupe
            key={g.id}
            groupe={g}
            prenoms={prenoms}
            peutCorriger={peutCorriger}
            onAller={onAller}
            onCorriger={onCorriger}
          />
        ))}
      </ul>
    )
  }
  return (
    <section aria-label="Données à ranger" className="flex flex-col gap-2">
      <h3 className="flex items-baseline gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Données à ranger
        {groupes && groupes.length > 0 && (
          <span className="font-normal tabular-nums">{groupes.length}</span>
        )}
      </h3>
      <p className="text-xs text-muted-foreground">{plage}</p>
      {corps}
    </section>
  )
}

function ListeDates({
  shifts,
  prenoms,
}: {
  shifts: readonly ShiftLu[]
  prenoms: ReadonlyMap<number, string>
}) {
  return (
    <ul className="mt-1 max-h-48 overflow-y-auto text-xs text-muted-foreground tabular-nums">
      {shifts.map((s) => (
        <li key={s.id}>
          {dateLisible(dateShift(s))}
          {prenoms.has(s.salarie_id) && ` · ${prenoms.get(s.salarie_id)}`}
          {` · ${s.debut} - ${s.fin}`}
        </li>
      ))}
    </ul>
  )
}

function LigneGroupe({
  groupe: g,
  prenoms,
  peutCorriger,
  onAller,
  onCorriger,
}: {
  groupe: GroupeARanger
  prenoms: ReadonlyMap<number, string>
  peutCorriger: boolean
  onAller: (lien: LienReglage) => void
  onCorriger: (g: GroupeARanger) => Promise<string | null>
}) {
  const [confirmer, setConfirmer] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const tous = [...g.shifts, ...g.verrouilles]
  const valider = async () => {
    setEnCours(true)
    setErreur(null)
    const echec = await onCorriger(g)
    setEnCours(false)
    if (echec) setErreur(echec)
    else setConfirmer(false)
  }
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      <p className="text-sm">{g.texte}</p>
      {!confirmer && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            Voir les dates ({tous.length})
          </summary>
          <ListeDates shifts={tous} prenoms={prenoms} />
        </details>
      )}
      {confirmer && g.action && (
        <div className="rounded-lg border bg-muted/40 p-2.5">
          <p className="text-sm font-medium">
            {nShifts(g.shifts.length)}{' '}
            {g.shifts.length > 1 ? 'seront modifiés' : 'sera modifié'} :{' '}
            {g.action.charAt(0).toLowerCase() + g.action.slice(1)}. Rien d'autre
            ne change.
          </p>
          <ListeDates shifts={g.shifts} prenoms={prenoms} />
          {erreur && <p className="mt-2 text-sm text-destructive">{erreur}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={enCours}
              onClick={() => {
                setConfirmer(false)
                setErreur(null)
              }}
            >
              Annuler
            </Button>
            <Button size="sm" disabled={enCours} onClick={() => void valider()}>
              {enCours && <Loader2 className="animate-spin" />}
              Confirmer
            </Button>
          </div>
        </div>
      )}
      {!confirmer && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Voir le réglage : ${g.texte}`}
            onClick={() => onAller(g.lien)}
          >
            Voir le réglage
            <ChevronRight />
          </Button>
          {g.action && (
            <Button
              variant="outline"
              size="sm"
              disabled={!peutCorriger}
              title={
                peutCorriger
                  ? undefined
                  : 'Vos droits sur le planning ne permettent pas de modifier les shifts'
              }
              onClick={() => setConfirmer(true)}
            >
              {g.action}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

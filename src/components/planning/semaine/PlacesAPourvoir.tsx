/*
 * Shifts à pourvoir du panneau « Points d'attention » (étape 8 du plan
 * `planning-coherence-2026-10-28`) : une ligne par groupe de places
 * identiques (« Club, M1 : lundi, mardi et jeudi »), et dedans, pour chaque
 * personne qui tient le poste (titulaires d'abord, D13), pourquoi elle ne
 * l'a pas pris, avec le lien vers le réglage qui le débloque, ou la mention
 * « limite légale », « au-delà de son contrat »… quand il n'y a rien à
 * régler. « Placer quelqu'un » propose les personnes libres ce jour-là ; la
 * vue ouvre la case choisie (`onPlacer`).
 *
 * Place que rien ne remplit (plan `planning-cycles-2026-10-30`, étape 5) :
 * quand UNE règle bloque tout le monde, sur ce code comme sur les autres
 * codes du même cycle, le panneau le dit franchement (« Je ne peux pas
 * remplir ce M3. », la raison, « Prenez un extra ou changez un shift. ») au
 * lieu des raisons personne par personne. « Placer quelqu'un » reste.
 *
 * Sans routeur : les liens passent par `onAller` (le panneau navigue).
 */

import { useState } from 'react'
import type { MouseEvent } from 'react'
import { ChevronRight, UserPlus } from 'lucide-react'

import { enListe, joursDesPlaces } from '#/components/planning/attention.ts'
import type {
  GroupePlaces,
  RolePlace,
  ShiftAPourvoir,
} from '#/components/planning/attention.ts'
import { Button } from '#/components/ui/button.tsx'
import type { LienReglage } from '#/lib/planning/coherence.ts'
import type { RaisonClaire } from '#/lib/planning/raisonsPlaces.ts'
import { heureAffichee } from '#/lib/planning/temps.ts'
import { cn } from '#/lib/utils.ts'

/** La case à ouvrir : la personne choisie, le jour de la place. `x`, `y` :
 * où ouvrir un menu (le bouton cliqué). */
export interface DemandePlacement {
  salarieId: number
  date: string
  /** Jour dans sa semaine (0 = lundi). */
  jour: number
  posteId: number
  horaireId: number | null
  x: number
  y: number
}

const JOUR = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const jourCourt = (date: string) => JOUR.format(new Date(`${date}T12:00:00Z`))

const ROLE: Record<RolePlace, string | null> = {
  titulaire: null,
  occasionnel: 'dépannage',
  extra: 'extra',
}

/** Ce qu'il reste à faire quand le moteur ne peut pas (D3). */
export const SOLUTION_HUMAINE = 'Prenez un extra ou changez un shift.'

/** « Je ne peux pas remplir ce M3. » ; sans code : « cette place ». */
export const jeNePeuxPas = (code: string | null) =>
  code
    ? `Je ne peux pas remplir ce ${code}.`
    : 'Je ne peux pas remplir cette place.'

const LIEN =
  'rounded text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none'

function Issue({
  raison,
  onAller,
}: {
  raison: RaisonClaire
  onAller: (lien: LienReglage) => void
}) {
  const i = raison.issue
  if (i.genre === 'lien') {
    return (
      <button type="button" className={LIEN} onClick={() => onAller(i.lien)}>
        {i.action}
      </button>
    )
  }
  return <span className="text-xs italic">{i.mention}</span>
}

function Placer({
  place,
  onPlacer,
}: {
  place: ShiftAPourvoir
  onPlacer: (d: DemandePlacement) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const libres = place.personnes.filter((p) => p.possible)
  const choisir = (id: number, e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    onPlacer({
      salarieId: id,
      date: place.date,
      jour: place.jour,
      posteId: place.posteId,
      horaireId: place.horaireId,
      x: r.left,
      y: r.bottom,
    })
  }
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-muted-foreground">
          {jourCourt(place.date)}
        </span>
        {place.manquant > 1 && (
          <span className="text-xs font-semibold">×{place.manquant}</span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-7 px-2 text-xs"
          aria-expanded={ouvert}
          aria-label={`Placer quelqu'un le ${jourCourt(place.date)}`}
          onClick={() => setOuvert((o) => !o)}
        >
          <UserPlus />
          Placer quelqu'un
        </Button>
      </div>
      {ouvert && (
        <div className="flex flex-wrap items-center gap-1 pl-[6.5rem]">
          {libres.length ? (
            libres.map((p) => (
              <Button
                key={p.id}
                variant="secondary"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={(e) => choisir(p.id, e)}
              >
                {p.nom}
                {ROLE[p.role] && (
                  <span className="text-muted-foreground">{ROLE[p.role]}</span>
                )}
              </Button>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">
              Personne n'est libre ce jour-là.
            </span>
          )}
        </div>
      )}
    </li>
  )
}

function Groupe({
  g,
  onAller,
  onPlacer,
}: {
  g: GroupePlaces
  onAller: (lien: LienReglage) => void
  onPlacer?: (d: DemandePlacement) => void
}) {
  const heures = `${heureAffichee(g.debut)}-${heureAffichee(g.fin)}`
  const nom = g.poste?.nom ?? 'Poste'
  const titre = g.code ? `${nom}, ${g.code}` : `${nom}, ${heures}`
  const jours = joursDesPlaces(g.places.map((p) => p.date))
  return (
    <li>
      <details className="group/raison">
        <summary
          className={cn(
            'flex cursor-pointer list-none items-baseline gap-2 px-3 py-1 hover:bg-muted/50 [&::-webkit-details-marker]:hidden',
          )}
        >
          <span
            className="size-2 shrink-0 self-center rounded-full"
            style={{ background: g.poste?.couleur }}
          />
          <span className="min-w-0">
            <strong>{titre}</strong> : {jours}
          </span>
          <ChevronRight className="ml-auto size-3.5 shrink-0 self-center text-muted-foreground transition-transform group-open/raison:rotate-90" />
        </summary>
        <div className="flex flex-col gap-2 px-3 pb-2 pl-7 text-sm">
          {g.code && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {heures}
            </span>
          )}
          {g.raisonCommune ? (
            <p className="flex flex-col text-xs text-muted-foreground">
              <strong className="text-sm text-foreground">
                {jeNePeuxPas(g.code)}
              </strong>
              <span>{g.raisonCommune}</span>
              <span>{SOLUTION_HUMAINE}</span>
            </p>
          ) : g.personnes.length ? (
            <ul className="flex flex-col gap-1" aria-label="Pourquoi personne">
              {g.personnes.map((p) => (
                <li key={p.id} className="flex flex-col">
                  <span>
                    <strong>{p.nom}</strong>
                    {ROLE[p.role] && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {ROLE[p.role]}
                      </span>
                    )}
                  </span>
                  {p.raisons.map((r) => (
                    <span
                      key={r.cle}
                      className="flex flex-wrap items-baseline gap-x-2 pl-3 text-xs text-muted-foreground"
                    >
                      <span>
                        {r.phrase}
                        {r.dates && ` (${joursDesPlaces(r.dates)})`}
                      </span>
                      <Issue raison={r} onAller={onAller} />
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
              Personne ne tient ce poste seul.
              <button
                type="button"
                className={LIEN}
                onClick={() => onAller({ page: '/planning/equipe' })}
              >
                Équipe
              </button>
              <button
                type="button"
                className={LIEN}
                onClick={() =>
                  onAller({
                    page: '/planning/besoins',
                    cible: `poste-${g.posteId}`,
                  })
                }
              >
                Besoins
              </button>
            </span>
          )}
          {g.autresCodes.map((a) => (
            <span key={a.code} className="text-xs text-muted-foreground">
              Possible en {a.code} : {enListe(a.noms)}.
            </span>
          ))}
          {onPlacer && (
            <ul className="flex flex-col gap-1 border-t pt-2">
              {g.places.map((place) => (
                <Placer key={place.cle} place={place} onPlacer={onPlacer} />
              ))}
            </ul>
          )}
        </div>
      </details>
    </li>
  )
}

export function PlacesAPourvoir({
  groupes,
  onAller,
  onPlacer,
}: {
  groupes: GroupePlaces[]
  onAller: (lien: LienReglage) => void
  /** Sans lui (lecture seule), pas de bouton « Placer quelqu'un ». */
  onPlacer?: (d: DemandePlacement) => void
}) {
  return groupes.map((g) => (
    <Groupe key={g.cle} g={g} onAller={onAller} onPlacer={onPlacer} />
  ))
}

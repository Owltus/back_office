/*
 * Tableau de l'accueil (remplace la « Présence minimum », décision
 * utilisateur du 2026-11-01, plan `plan/planning-accueil-2026-11-01/`) :
 * combien de personnes le matin, le soir et la nuit, chaque jour. Les postes
 * du matin et du soir ensemble (l'app répartit et choisit les horaires),
 * ceux de la nuit la nuit. 0 retire la case.
 *
 * Refait le 2026-11-11 (demande utilisateur : « imbitable »). Le jour, le
 * chiffre est un MINIMUM : le calcul peut ajouter quelqu'un qui manque
 * d'heures, au prix du surplus (D8, `generateur.ts`), « raisonnable, de temps
 * en temps ». La nuit, il est exact (plafond dur, un seul veilleur). Le
 * réglage « au moins … au plus … » (2026-11-06) est RETIRÉ de l'écran : la
 * case écrit minimum = maximum ; un maximum plus haut déjà en base reste lu
 * par le calcul.
 *
 * Écritures et Annuler : `BesoinsPage` (une seule pile pour toute la page).
 */

import { seulementLaNuit } from '#/lib/planning/zones.ts'
import type { ZoneRegle } from '#/lib/planning/zones.ts'
import { useState } from 'react'
import type { Sun } from 'lucide-react'

import { Compteur } from '#/components/planning/parametres/reglages/controles.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover.tsx'
import { useMoments } from '#/components/planning/hooks/useMoments.ts'
import { iconeDe } from '#/components/planning/semaine/Presence.tsx'
import { estNuit, momentDe, momentsDuTableau } from '#/lib/planning/moment.ts'
import type { Moments } from '#/lib/planning/moment.ts'
import { clePresence } from '#/lib/planning/presence.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type { Consigne, Horaire, Poste } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

type Periode = Consigne['periode']

/** Une case du tableau : au moins `minimum`, au plus `maximum` (null : le
 * minimum, un chiffre exact). */
export interface BornesAccueil {
  minimum: number
  maximum: number | null
}

/** Les lignes du tableau : les moments du tableau de l'établissement, dans
 * l'ordre de la journée (à l'hôtel : matin, soir, nuit). */
export function periodesDuTableau(l: Moments): ReadonlyArray<{
  periode: Periode
  libelle: string
  Icone: typeof Sun
  /** Moment de nuit : chiffre exact, jamais personne en plus. */
  nuit: boolean
}> {
  return momentsDuTableau(l).map((p) => ({
    periode: p,
    libelle: momentDe(l, p)?.nom ?? p,
    Icone: iconeDe(l, p),
    nuit: estNuit(l, p),
  }))
}

export function TableauAccueil({
  zone,
  premier = true,
  postes,
  horaires = [],
  modifiable,
  affiche,
  regler,
}: {
  /** La zone du tableau (2026-11-06). */
  zone: Pick<ZoneRegle, 'id' | 'nom'>
  /** Le premier tableau de la page (il porte les ancres des liens). */
  premier?: boolean
  /** Les postes de la zone. */
  postes: ReadonlyArray<Poste>
  horaires?: ReadonlyArray<Horaire>
  modifiable: boolean
  affiche: (jour: number, periode: Periode) => BornesAccueil
  regler: (jour: number, periode: Periode, b: BornesAccueil) => void
}) {
  const moments = useMoments()
  const sansJour = !postes.some(
    (p) => !p.ferme && !seulementLaNuit(p, horaires, moments),
  )
  const titre = `titre-zone-${zone.id}`
  const periodes = periodesDuTableau(moments)
  const caseVide = periodes.some(({ periode }) =>
    JOURS.some((_, j) => affiche(j, periode).minimum === 0),
  )

  return (
    <section
      id={premier ? 'besoins-presence' : `besoins-zone-${zone.id}`}
      aria-labelledby={titre}
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex max-w-3xl flex-col gap-1">
        <h3 id={titre} className="text-base font-semibold">
          {zone.nom}
        </h3>
        {/* Un paragraphe, pas une liste (demande utilisateur du
            2026-11-11 : « je préfère les textes »). */}
        {/* Court et sans nom de poste (demande utilisateur du 2026-11-11). */}
        <p className="text-sm text-muted-foreground">
          {sansJour &&
            `Aucun poste de jour : rattachez-en un à la zone ${zone.nom} dans Postes. `}
          Le jour, le nombre est un minimum ; la nuit, il est exact. Les
          apprentis et les stagiaires comptent, mais ne sont jamais seuls.
          {caseVide && (
            <>
              {' '}
              Un tiret <span className="text-amber-500">–</span> : personne
              n'est demandé.
            </>
          )}
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table
          aria-label={zone.nom}
          className="w-full min-w-[44rem] table-fixed border-collapse text-sm"
        >
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-[1] w-[11.5rem] bg-muted px-3 py-2 text-left font-medium">
                Moment
              </th>
              {JOURS.map((j) => (
                <th key={j} className="px-1 py-2 text-center font-medium">
                  <span aria-hidden>{j.slice(0, 3)}.</span>
                  <span className="sr-only">{j}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periodes.map(({ periode, libelle, Icone, nuit: deNuit }) => (
              <tr key={periode} className="border-t">
                <th
                  scope="row"
                  className="sticky left-0 z-[1] bg-card px-3 py-2 text-left font-medium"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Icone
                      aria-hidden
                      className="size-4 text-muted-foreground"
                    />
                    {libelle}
                  </span>
                </th>
                {JOURS.map((_, j) => (
                  <td key={j} className="p-1 text-center">
                    <CaseAccueil
                      jour={j}
                      periode={periode}
                      libelle={libelle}
                      nuit={deNuit}
                      bornes={affiche(j, periode)}
                      modifiable={modifiable}
                      regler={regler}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CaseAccueil({
  jour,
  periode,
  libelle,
  nuit,
  bornes,
  modifiable,
  regler,
}: {
  jour: number
  periode: Periode
  libelle: string
  nuit: boolean
  bornes: BornesAccueil
  modifiable: boolean
  regler: (jour: number, periode: Periode, b: BornesAccueil) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const nombre = bornes.minimum
  const nomJour = JOURS[jour]
  const titre = `${libelle} · ${nomJour}`
  const pluriel = nombre > 1 ? 's' : ''
  const mot = nuit ? 'Exactement' : 'Au moins'
  const dit = !nombre
    ? "personne n'est demandé"
    : `${mot.toLowerCase()} ${nombre} personne${pluriel}`
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${libelle}, ${nomJour.toLowerCase()} : ${dit}.`}
          data-presence={clePresence(jour, periode)}
          className={cn(
            'flex h-12 w-full items-center justify-center rounded-md border border-transparent transition-colors outline-none hover:border-border hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring',
            ouvert && 'border-primary bg-primary/10',
          )}
        >
          <span
            className={cn(
              'text-sm font-semibold tabular-nums',
              !nombre && 'text-amber-500',
            )}
          >
            {nombre || '–'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-64" aria-label={titre}>
        <div className="flex flex-col gap-3 text-sm">
          <p className="font-semibold">{titre}</p>
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">{mot}</p>
            <Compteur
              valeur={nombre}
              etiquette={mot}
              disabled={!modifiable}
              onChange={(v) =>
                regler(jour, periode, { minimum: v, maximum: v })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {!nombre
              ? "Personne n'est demandé : ce moment peut rester vide."
              : nuit
                ? `Le planning met ${nombre} personne${pluriel}, jamais plus. S'il en manque, il vous le dit.`
                : `Le planning met au moins ${nombre} personne${pluriel}. Il en ajoute une si quelqu'un manque d'heures. S'il en manque, il vous le dit.`}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}

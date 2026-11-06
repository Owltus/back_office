/*
 * Tableau de l'accueil (remplace la « Présence minimum », décision
 * utilisateur du 2026-11-01, plan `plan/planning-accueil-2026-11-01/`) :
 * combien de personnes le matin, le soir et la nuit, chaque jour. Les postes
 * du matin et du soir ensemble (l'app répartit et choisit les horaires),
 * ceux de la nuit la nuit. Un chiffre EXACT par défaut (minimum = maximum) ;
 * « au moins … au plus … » sur demande (2026-11-06). 0 retire la case.
 *
 * Écritures et Annuler : `BesoinsPage` (une seule pile pour toute la page).
 */

import { seulementLaNuit, tientLaNuit } from '#/lib/planning/zones.ts'
import type { ZoneRegle } from '#/lib/planning/zones.ts'
import { useState } from 'react'
import type { Sun } from 'lucide-react'

import { Compteur } from '#/components/planning/parametres/reglages/controles.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover.tsx'
import { Button } from '#/components/ui/button.tsx'
import { useMoments } from '#/components/planning/hooks/useMoments.ts'
import { iconeDe } from '#/components/planning/semaine/Presence.tsx'
import { momentDe, momentsDuTableau } from '#/lib/planning/moment.ts'
import type { Moments } from '#/lib/planning/moment.ts'
import { listeEt } from '#/lib/planning/affichage.ts'
import { clePresence, libelleConsigne } from '#/lib/planning/presence.ts'
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
}> {
  return momentsDuTableau(l).map((p) => ({
    periode: p,
    libelle: momentDe(l, p)?.nom ?? p,
    Icone: iconeDe(l, p),
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
  const jour = postes
    .filter((p) => !p.ferme && !seulementLaNuit(p, horaires, moments))
    .map((p) => p.nom)
  const nuit = postes
    .filter((p) => tientLaNuit(p, horaires, moments))
    .map((p) => p.nom)
  const titre = `titre-zone-${zone.id}`

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
        <p className="text-sm text-muted-foreground">
          {jour.length
            ? `Le jour : ${listeEt(jour)} ensemble, le planning répartit.`
            : `Aucun poste de jour : dans Postes, choisissez la zone ${zone.nom}.`}{' '}
          {nuit.length ? `La nuit : ${listeEt(nuit)}.` : 'Aucun poste de nuit.'}
        </p>
        <p className="text-xs text-muted-foreground">
          Les apprentis comptent, jamais seuls. Un tiret orange : personne de
          demandé.
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
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {periodesDuTableau(moments).map(({ periode, libelle, Icone }) => (
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
                      bornes={affiche(j, periode)}
                      modifiable={modifiable}
                      regler={regler}
                    />
                  </td>
                ))}
                <td />
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
  bornes,
  modifiable,
  regler,
}: {
  jour: number
  periode: Periode
  libelle: string
  bornes: BornesAccueil
  modifiable: boolean
  regler: (jour: number, periode: Periode, b: BornesAccueil) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const nombre = bornes.minimum
  const plafond = Math.max(nombre, bornes.maximum ?? nombre)
  const plage = plafond > nombre
  // « Au moins … au plus … » montré sur demande, ou s'il est déjà réglé.
  const [deux, setDeux] = useState(plage)
  const nomJour = JOURS[jour]
  const titre = `${libelle} · ${nomJour}`
  const texte = libelleConsigne(nombre, plafond)
  const dit = plafond
    ? `${texte} personne${plafond > 1 ? 's' : ''}`
    : "personne de demandé, l'hôtel peut rester vide"
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
              !plafond && 'text-amber-500',
            )}
          >
            {plafond ? texte : '–'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-64" aria-label={titre}>
        <div className="flex flex-col gap-3 text-sm">
          <p className="font-semibold">{titre}</p>
          {deux ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">Au moins</p>
                <Compteur
                  valeur={nombre}
                  etiquette="Au moins"
                  disabled={!modifiable}
                  onChange={(v) =>
                    regler(jour, periode, {
                      minimum: v,
                      maximum: Math.max(v, plafond),
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">Au plus</p>
                <Compteur
                  valeur={plafond}
                  min={nombre}
                  etiquette="Au plus"
                  disabled={!modifiable}
                  onChange={(v) =>
                    regler(jour, periode, { minimum: nombre, maximum: v })
                  }
                />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">Personnes</p>
              <Compteur
                valeur={nombre}
                etiquette="Personnes"
                disabled={!modifiable}
                onChange={(v) =>
                  regler(jour, periode, { minimum: v, maximum: v })
                }
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {!plafond
              ? "Personne de demandé : l'hôtel peut rester sans personne à ce moment."
              : plage
                ? `Entre ${nombre} et ${plafond} personnes. S'il en manque, l'app vous le dit.`
                : "Exactement ce nombre. S'il manque du monde, l'app vous le dit."}
          </p>
          {modifiable && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start px-0 text-xs"
              onClick={() => {
                if (deux)
                  regler(jour, periode, { minimum: nombre, maximum: nombre })
                setDeux(!deux)
              }}
            >
              {deux ? 'Un chiffre exact' : 'Au moins … au plus …'}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/*
 * Tableau de l'accueil (remplace la « Présence minimum », décision
 * utilisateur du 2026-11-01, plan `plan/planning-accueil-2026-11-01/`) :
 * combien de personnes EXACTEMENT le matin, le soir et la nuit, chaque jour.
 * Réception et Club ensemble le matin et le soir (l'app répartit et choisit
 * les horaires), les veilleurs la nuit. Un chiffre par case, rangé dans
 * `planning_consignes` avec minimum = maximum ; 0 retire la case.
 *
 * Écritures et Annuler : `BesoinsPage` (une seule pile pour toute la page).
 */

import { tientLaNuit } from '#/lib/planning/presence.ts'
import { useState } from 'react'
import { Moon, Sun, Sunset } from 'lucide-react'

import { Compteur } from '#/components/planning/parametres/reglages/controles.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover.tsx'
import { listeEt } from '#/lib/planning/affichage.ts'
import { clePresence } from '#/lib/planning/presence.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type { Consigne, Poste } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

type Periode = Consigne['periode']

export const PERIODES: ReadonlyArray<{
  periode: Periode
  libelle: string
  Icone: typeof Sun
}> = [
  { periode: 'matin', libelle: 'Matin', Icone: Sun },
  { periode: 'soir', libelle: 'Soir', Icone: Sunset },
  { periode: 'nuit', libelle: 'Nuit', Icone: Moon },
]

export function TableauAccueil({
  postes,
  modifiable,
  affiche,
  regler,
}: {
  postes: ReadonlyArray<Poste>
  modifiable: boolean
  affiche: (jour: number, periode: Periode) => number
  regler: (jour: number, periode: Periode, n: number) => void
}) {
  const jour = postes.filter((p) => p.presence && !p.ferme).map((p) => p.nom)
  const nuit = postes.filter((p) => tientLaNuit(p)).map((p) => p.nom)

  return (
    <section
      id="besoins-presence"
      aria-labelledby="titre-accueil"
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex max-w-3xl flex-col gap-1">
        <h2 id="titre-accueil" className="text-base font-semibold">
          Accueil
        </h2>
        <p className="text-sm text-muted-foreground">
          {jour.length
            ? `Combien de personnes il faut, chaque jour. Le matin et le soir : ${listeEt(jour)} ensemble, l'app répartit et choisit les horaires.`
            : "Aucun poste de l'accueil : dans Postes, activez Poste de l'accueil sur Réception et Club."}{' '}
          {nuit.length
            ? `La nuit : ${listeEt(nuit)}.`
            : 'Aucun poste de nuit : dans Postes, réglez Accueil sur Nuit pour le poste des veilleurs.'}
        </p>
        <p className="text-xs text-muted-foreground">
          Une personne en milieu de journée compte le matin et le soir. Les
          apprentis comptent, jamais seuls. Une case vide, en orange : personne
          n'est demandé, l'hôtel peut rester vide à ce moment.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table
          aria-label="Accueil"
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
            {PERIODES.map(({ periode, libelle, Icone }) => (
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
                      nombre={affiche(j, periode)}
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
  nombre,
  modifiable,
  regler,
}: {
  jour: number
  periode: Periode
  libelle: string
  nombre: number
  modifiable: boolean
  regler: (jour: number, periode: Periode, n: number) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const nomJour = JOURS[jour]
  const titre = `${libelle} · ${nomJour}`
  const dit = nombre
    ? `${nombre} personne${nombre > 1 ? 's' : ''}`
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
            <p className="font-medium">Personnes</p>
            <Compteur
              valeur={nombre}
              etiquette="Personnes"
              disabled={!modifiable}
              onChange={(v) => regler(jour, periode, v)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {nombre
              ? "Exactement ce nombre. S'il manque du monde, l'app vous le dit."
              : "Personne de demandé : l'hôtel peut rester sans personne à ce moment."}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}

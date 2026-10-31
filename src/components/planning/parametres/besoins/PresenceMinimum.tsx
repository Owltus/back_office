/*
 * Présence minimum (remplace la vue « Par cycle » et `ConsignesPresence.tsx`,
 * refonte du 2026-10-31) : combien de personnes au moins, et au plus, le
 * matin, le soir et la nuit, tous postes de présence confondus. Sous la
 * grille des besoins, en langage simple ; chaque jour porte un repère vert
 * ou orange qui dit si les besoins de la grille (tous postes qui comptent)
 * atteignent le minimum, par la même somme que le contrôle des réglages
 * (`besoinsPresence`, règle `periodePresence` : middle exclu, la nuit
 * seulement sur les postes qui ont un horaire de nuit).
 *
 * Écritures et Annuler : `BesoinsPage` (une seule pile pour toute la page).
 */

import { useMemo, useState } from 'react'
import { Moon, Sun, Sunset } from 'lucide-react'

import { Compteur } from '#/components/planning/parametres/reglages/controles.tsx'
import { besoinsEnEcart } from '#/components/planning/parametres/reglages/besoins.ts'
import type { Bornes } from '#/components/planning/parametres/besoins/historique.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover.tsx'
import { listeEt } from '#/lib/planning/affichage.ts'
import { besoinsPresence, postesComptes } from '#/lib/planning/coherence.ts'
import { clePresence, libelleConsigne } from '#/lib/planning/presence.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type { Consigne, Referentiel } from '#/lib/planning/types.ts'
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

/** État du repère d'un jour : rien de demandé, tenu, ou pas tenu. */
export function etatPresence(
  besoins: number,
  b: Bornes,
): { etat: 'neutre' | 'ok' | 'ecart'; texte: string } {
  if (b.minimum === 0 && b.maximum === null) {
    return { etat: 'neutre', texte: 'Aucun minimum demandé.' }
  }
  if (besoins < b.minimum) {
    return {
      etat: 'ecart',
      texte: `Les besoins donnent ${besoins}, le minimum est ${b.minimum}.`,
    }
  }
  if (besoinsEnEcart(besoins, b)) {
    return {
      etat: 'ecart',
      texte: `Les besoins donnent ${besoins}, le maximum est ${b.maximum}.`,
    }
  }
  return { etat: 'ok', texte: `Les besoins donnent ${besoins} : c'est bon.` }
}

export function PresenceMinimum({
  referentiel,
  modifiable,
  affiche,
  regler,
}: {
  referentiel: Referentiel
  modifiable: boolean
  affiche: (jour: number, periode: Periode) => Bornes
  regler: (
    jour: number,
    periode: Periode,
    champ: keyof Bornes,
    v: number,
  ) => void
}) {
  const comptent = postesComptes(referentiel, 'matin')
  const deNuit = postesComptes(referentiel, 'nuit')
  const besoins = useMemo(() => besoinsPresence(referentiel), [referentiel])

  return (
    <section
      id="besoins-presence"
      aria-labelledby="titre-presence"
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex max-w-3xl flex-col gap-1">
        <h2 id="titre-presence" className="text-base font-semibold">
          Présence minimum
        </h2>
        <p className="text-sm text-muted-foreground">
          {comptent.length
            ? `Combien de personnes au moins (et au plus) le matin, le soir et la nuit, tous postes de présence confondus (${listeEt(comptent.map((p) => p.nom))}).`
            : 'Aucun poste ne compte encore le matin et le soir : cochez-les dans Postes.'}{' '}
          {deNuit.length
            ? `La nuit compte ${listeEt(deNuit.map((p) => p.nom))}.`
            : "La nuit ne compte pas : aucun poste n'a d'horaire de nuit."}
        </p>
        <p className="text-xs text-muted-foreground">
          Le repère de chaque jour dit si les besoins de la grille suffisent. Un
          middle compte comme présent, mais pas dans ces minimums.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table
          aria-label="Présence minimum"
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
                {JOURS.map((_, jour) => (
                  <td key={jour} className="p-1 text-center">
                    <CasePresence
                      jour={jour}
                      periode={periode}
                      libelle={libelle}
                      bornes={affiche(jour, periode)}
                      besoins={besoins.get(clePresence(jour, periode)) ?? 0}
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

function CasePresence({
  jour,
  periode,
  libelle,
  bornes: b,
  besoins,
  modifiable,
  regler,
}: {
  jour: number
  periode: Periode
  libelle: string
  bornes: Bornes
  besoins: number
  modifiable: boolean
  regler: (
    jour: number,
    periode: Periode,
    champ: keyof Bornes,
    v: number,
  ) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const { etat, texte } = etatPresence(besoins, b)
  const nomJour = JOURS[jour]
  const voulu =
    b.minimum === 0 && b.maximum === null
      ? 'aucun minimum'
      : libelleConsigne(b.minimum, b.maximum)
  const titre = `${libelle} · ${nomJour}`
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${libelle}, ${nomJour.toLowerCase()} : ${voulu}. ${texte}`}
          data-presence={clePresence(jour, periode)}
          data-etat={etat}
          className={cn(
            'flex h-12 w-full flex-col items-center justify-center gap-0.5 rounded-md border border-transparent transition-colors outline-none hover:border-border hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring',
            ouvert && 'border-primary bg-primary/10',
          )}
        >
          <span
            className={cn(
              'text-sm font-semibold tabular-nums',
              etat === 'neutre' && 'text-muted-foreground/40',
            )}
          >
            {etat === 'neutre' ? '–' : libelleConsigne(b.minimum, b.maximum)}
          </span>
          {etat !== 'neutre' && (
            <Tip label={texte}>
              <span
                aria-hidden
                className={cn(
                  'size-2 rounded-full',
                  etat === 'ok' ? 'bg-emerald-500' : 'bg-amber-500',
                )}
              />
            </Tip>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72" aria-label={titre}>
        <div className="flex flex-col gap-3 text-sm">
          <p className="font-semibold">{titre}</p>
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">Au moins</p>
            <Compteur
              valeur={b.minimum}
              etiquette="Au moins"
              disabled={!modifiable}
              onChange={(v) => regler(jour, periode, 'minimum', v)}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">Au plus</p>
            <Compteur
              valeur={b.maximum ?? b.minimum}
              etiquette="Au plus"
              disabled={!modifiable}
              onChange={(v) => regler(jour, periode, 'maximum', v)}
            />
          </div>
          <p
            className={cn(
              'text-xs',
              etat === 'ecart' ? 'text-amber-500' : 'text-muted-foreground',
            )}
          >
            {texte}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}

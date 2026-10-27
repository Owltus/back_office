/*
 * Consignes de présence à l'écran : deux pastilles sous chaque jour de la
 * semaine (matin, soir : présents / attendus) et la section des écarts dans
 * « Points d'attention ». Ambre : il manque du monde ; bleu : du monde en
 * plus ; discret : conforme.
 */

import { Sun, Sunset } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { libelleConsigne } from '#/lib/planning/presence.ts'
import type { PresenceOut } from '#/lib/planning/presence.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { ajouterJours } from '#/lib/planning/temps.ts'
import { cn } from '#/lib/utils.ts'

const NOM = { matin: 'Matin', soir: 'Soir' } as const

const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const quand = (lundi: string, jour: number) =>
  FORMAT_JOUR.format(new Date(`${ajouterJours(lundi, jour)}T12:00:00Z`))

/** « 1 de moins », « 2 de plus ». */
export function ecartTexte(ecart: number): string {
  return ecart < 0 ? `${-ecart} de moins` : `${ecart} de plus`
}

export const ecartsPresence = (semaines: SemaineOut[]) =>
  semaines.flatMap((s) =>
    s.presence
      .filter((p) => p.ecart !== 0)
      .map((p) => ({ ...p, lundi: s.lundi })),
  )

export function PastillesPresence({ presence }: { presence: PresenceOut[] }) {
  if (!presence.length) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {presence.map((p) => {
        const Icone = p.periode === 'matin' ? Sun : Sunset
        const attendu = libelleConsigne(p.minimum, p.maximum)
        const texte = `${NOM[p.periode]} : ${p.compte} présent${p.compte > 1 ? 's' : ''} pour ${attendu} attendu${p.minimum > 1 ? 's' : ''}${p.ecart ? ` (${ecartTexte(p.ecart)})` : ''}`
        return (
          <Tip key={p.periode} label={texte}>
            <span
              tabIndex={0}
              aria-label={texte}
              className={cn(
                'inline-flex items-center gap-0.5 rounded px-1 text-[10px] font-semibold tabular-nums',
                p.ecart < 0 && 'bg-amber-500/15 text-amber-500',
                p.ecart > 0 && 'bg-sky-500/15 text-sky-500',
                p.ecart === 0 && 'bg-muted text-muted-foreground',
              )}
            >
              <Icone className="size-3" />
              {p.compte}/{attendu}
            </span>
          </Tip>
        )
      })}
    </div>
  )
}

/** Vue mois : deux points sous le numéro du jour (matin, soir). */
export function PointsPresence({ presence }: { presence: PresenceOut[] }) {
  if (!presence.length) return null
  const lignes = presence.map(
    (p) =>
      `${NOM[p.periode]} : ${p.compte} pour ${libelleConsigne(p.minimum, p.maximum)}${p.ecart ? ` (${ecartTexte(p.ecart)})` : ''}`,
  )
  return (
    <Tip
      label={<span className="whitespace-pre-line">{lignes.join('\n')}</span>}
    >
      <span
        tabIndex={0}
        aria-label={lignes.join(', ')}
        className="mt-0.5 flex justify-center gap-0.5"
      >
        {presence.map((p) => (
          <span
            key={p.periode}
            className={cn(
              'size-1.5 rounded-full',
              p.ecart < 0 && 'bg-amber-500',
              p.ecart > 0 && 'bg-sky-500',
              p.ecart === 0 && 'bg-muted-foreground/40',
            )}
          />
        ))}
      </span>
    </Tip>
  )
}

export function SectionPresence({ semaines }: { semaines: SemaineOut[] }) {
  const consignes = semaines.some((s) => s.presence.length > 0)
  if (!consignes) return null
  const ecarts = ecartsPresence(semaines)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">
        Présence du matin et du soir ({ecarts.length})
      </h3>
      {ecarts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Toutes les consignes sont respectées.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {ecarts.map((e) => (
            <li
              key={`${e.lundi}-${e.jour}-${e.periode}`}
              className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2"
            >
              {e.periode === 'matin' ? (
                <Sun className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Sunset className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="text-muted-foreground">
                {quand(e.lundi, e.jour)}
              </span>
              <span>
                {NOM[e.periode]} : {e.compte} pour{' '}
                {libelleConsigne(e.minimum, e.maximum)}
              </span>
              <span
                className={cn(
                  'ml-auto rounded-full px-1.5 text-xs font-semibold',
                  e.ecart < 0
                    ? 'bg-amber-500/15 text-amber-500'
                    : 'bg-sky-500/15 text-sky-500',
                )}
              >
                {ecartTexte(e.ecart)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

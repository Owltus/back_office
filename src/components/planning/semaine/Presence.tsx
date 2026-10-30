/*
 * Consignes de présence à l'écran : deux pastilles sous chaque jour de la
 * semaine (matin, soir : présents / attendus) et des points sous ceux du
 * mois ; les écarts vont dans « Points d'attention » (`attention.ts`). Ambre : il manque du monde ; bleu : du monde en
 * plus ; discret : conforme.
 */

import { Moon, Sun, Sunset } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { libelleConsigne } from '#/lib/planning/presence.ts'
import type { PresenceOut } from '#/lib/planning/presence.ts'
import { cn } from '#/lib/utils.ts'

const NOM = { matin: 'Matin', soir: 'Soir', nuit: 'Nuit' } as const
const ICONE = { matin: Sun, soir: Sunset, nuit: Moon } as const

/** « 1 de moins », « 2 de plus ». */
export function ecartTexte(ecart: number): string {
  return ecart < 0 ? `${-ecart} de moins` : `${ecart} de plus`
}

export function PastillesPresence({ presence }: { presence: PresenceOut[] }) {
  if (!presence.length) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {presence.map((p) => {
        const Icone = ICONE[p.periode]
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

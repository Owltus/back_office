/*
 * Personnes par cycle à l'écran : une pastille par consigne sous chaque jour
 * de la semaine (matin, soir, nuit : présents / attendus, dans l'ordre de
 * `ORDRE_PERIODES`, déjà trié par `bilanPresence`) et un point par consigne
 * sous ceux du mois. Les écarts vont dans « Points d'attention »
 * (`attention.ts`). Couleurs (décision utilisateur du 2026-10-31, « plus
 * clair ») : vert, conforme ; rouge, il manque du monde ; bleu, plus que le
 * maximum. Le mois montre TOUJOURS trois points (matin, soir, nuit) : un
 * moment sans minimum réglé est un rond vide. Un middle n'est jamais compté
 * (D11), la nuit l'est sur les postes à code de nuit (D15).
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
                p.ecart < 0 && 'bg-red-500/15 text-red-500',
                p.ecart > 0 && 'bg-sky-500/15 text-sky-500',
                p.ecart === 0 && 'bg-emerald-500/15 text-emerald-500',
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

const PERIODES = ['matin', 'soir', 'nuit'] as const

/** Vue mois : trois points sous le numéro du jour, matin, soir, nuit. Un
 * moment sans minimum réglé (page Besoins) est un rond vide. Rien tant que
 * la semaine n'est pas lue. */
export function PointsPresence({
  presence,
}: {
  presence: PresenceOut[] | undefined
}) {
  if (!presence) return null
  const points = PERIODES.map((periode) => ({
    periode,
    p: presence.find((x) => x.periode === periode),
  }))
  const lignes = points.map(({ periode, p }) =>
    p
      ? `${NOM[periode]} : ${p.compte} pour ${libelleConsigne(p.minimum, p.maximum)}${p.ecart ? ` (${ecartTexte(p.ecart)})` : ''}`
      : `${NOM[periode]} : aucun minimum réglé (page Besoins)`,
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
        {points.map(({ periode, p }) => (
          <span
            key={periode}
            data-periode={periode}
            className={cn(
              'size-1.5 rounded-full',
              !p && 'border border-muted-foreground/50',
              p && p.ecart < 0 && 'bg-red-500',
              p && p.ecart > 0 && 'bg-sky-500',
              p && p.ecart === 0 && 'bg-emerald-500',
            )}
          />
        ))}
      </span>
    </Tip>
  )
}

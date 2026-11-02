/*
 * Personnes par cycle à l'écran : une pastille par consigne sous chaque jour
 * de la semaine (matin, soir, nuit : présents / attendus, dans l'ordre de
 * `ORDRE_PERIODES`, déjà trié par `bilanPresence`) et un point par consigne
 * sous ceux du mois. Les écarts vont dans « Points d'attention »
 * (`attention.ts`). Couleurs (décision utilisateur du 2026-10-31, « plus
 * clair ») : vert, conforme ; rouge, il manque du monde ; bleu, plus que le
 * nombre demandé. Le mois montre TOUJOURS trois points (matin, soir, nuit) :
 * un moment où rien n'est demandé est un rond vide. Depuis le tableau de
 * l'accueil (2026-11-01) : un nombre exact, un middle compte le matin et le
 * soir, la nuit est celle des veilleurs.
 */

import { Moon, Sun, Sunset } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { libelleConsigne } from '#/lib/planning/presence.ts'
import type { PresenceOut } from '#/lib/planning/presence.ts'
import type {
  EtatTransmission,
  Transmissions,
} from '#/lib/planning/verificateur.ts'
import { cn } from '#/lib/utils.ts'

const NOM = { matin: 'Matin', soir: 'Soir', nuit: 'Nuit' } as const
const PERIODES = ['matin', 'soir', 'nuit'] as const
const ICONE = { matin: Sun, soir: Sunset, nuit: Moon } as const

/** « 1 de moins », « 2 de plus ». */
export function ecartTexte(ecart: number): string {
  return ecart < 0 ? `${-ecart} de moins` : `${ecart} de plus`
}

/** Un moment où personne n'est demandé (audit RH du 2026-11-01) : l'hôtel
 * peut rester vide, comme le dit le rond orange du mois. */
const RIEN = "personne de demandé, l'hôtel peut rester vide"

export function PastillesPresence({ presence }: { presence: PresenceOut[] }) {
  if (!presence.length) return null
  const absents = PERIODES.filter((m) => !presence.some((p) => p.periode === m))
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {absents.map((m) => {
        const Icone = ICONE[m]
        const texte = `${NOM[m]} : ${RIEN}`
        return (
          <Tip key={m} label={texte}>
            <span
              tabIndex={0}
              aria-label={texte}
              className="inline-flex items-center gap-0.5 rounded border border-amber-500/60 px-1 text-[10px] font-semibold text-amber-500"
            >
              <Icone className="size-3" />–
            </span>
          </Tip>
        )
      })}
      {presence.map((p) => {
        const Icone = ICONE[p.periode]
        const attendu = libelleConsigne(p.minimum, p.maximum)
        const texte = `${NOM[p.periode]} : ${p.compte} présent${p.compte > 1 ? 's' : ''} pour ${attendu} demandé${p.minimum > 1 ? 's' : ''}${p.ecart ? ` (${ecartTexte(p.ecart)})` : ''}`
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

/** Le trait entre deux points : plein quand la transmission est assurée,
 * pointillé rouge quand personne n'est là pour la faire, rien quand une des
 * deux équipes est absente. */
function Lien({
  etat,
  demi = false,
}: {
  etat: EtatTransmission | undefined
  demi?: boolean
}) {
  return (
    <span
      aria-hidden
      data-transmission={etat ?? 'aucune'}
      className={cn(
        'h-0 shrink-0 self-center border-t-2',
        demi ? 'w-1.5' : 'w-2',
        etat === 'ok' && 'border-emerald-500/80',
        etat === 'manque' && 'border-dashed border-red-500',
        !etat && 'border-transparent',
      )}
    />
  )
}

const PASSAGE = {
  nuitMatin: 'Transmission nuit → matin',
  matinSoir: 'Transmission matin → soir',
  soirNuit: 'Transmission soir → nuit',
} as const

/** Vue mois : trois points sous le numéro du jour, matin, soir, nuit, reliés
 * quand l'équipe suivante arrive avant que la précédente parte (demande
 * utilisateur du 2026-11-02 : « un lien quand il y a quelqu'un pour faire les
 * transmissions »). Un petit trait à gauche du matin : la nuit d'avant. Un
 * moment où rien n'est demandé (page Besoins) est un rond vide. Rien tant
 * que la semaine n'est pas lue. */
export function PointsPresence({
  presence,
  transmissions,
}: {
  presence: PresenceOut[] | undefined
  transmissions?: Omit<Transmissions, 'jour'>
}) {
  if (!presence) return null
  const points = PERIODES.map((periode) => ({
    periode,
    p: presence.find((x) => x.periode === periode),
  }))
  const lignes = points.map(({ periode, p }) =>
    p
      ? `${NOM[periode]} : ${p.compte} pour ${libelleConsigne(p.minimum, p.maximum)}${p.ecart ? ` (${ecartTexte(p.ecart)})` : ''}`
      : `${NOM[periode]} : ${RIEN}`,
  )
  if (transmissions)
    for (const cle of ['nuitMatin', 'matinSoir', 'soirNuit'] as const) {
      const e = transmissions[cle]
      if (e)
        lignes.push(
          `${PASSAGE[cle]} : ${e === 'ok' ? 'assurée' : 'personne pour la faire'}`,
        )
    }
  const point = (periode: (typeof PERIODES)[number]) => {
    const p = points.find((x) => x.periode === periode)?.p
    return (
      <span
        key={periode}
        data-periode={periode}
        className={cn(
          'size-2 shrink-0 rounded-full',
          !p && 'border border-amber-500',
          p && p.ecart < 0 && 'bg-red-500',
          p && p.ecart > 0 && 'bg-sky-500',
          p && p.ecart === 0 && 'bg-emerald-500',
        )}
      />
    )
  }
  return (
    <Tip
      label={<span className="whitespace-pre-line">{lignes.join('\n')}</span>}
    >
      <span
        tabIndex={0}
        aria-label={lignes.join(', ')}
        className={cn(
          'mt-0.5 flex items-center justify-center',
          !transmissions && 'gap-0.5',
        )}
      >
        {transmissions ? (
          <>
            <Lien etat={transmissions.nuitMatin} demi />
            {point('matin')}
            <Lien etat={transmissions.matinSoir} />
            {point('soir')}
            <Lien etat={transmissions.soirNuit} />
            {point('nuit')}
            <span aria-hidden className="w-1.5 shrink-0" />
          </>
        ) : (
          PERIODES.map(point)
        )}
      </span>
    </Tip>
  )
}

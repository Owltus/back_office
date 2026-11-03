/*
 * Personnes par cycle à l'écran : une pastille par consigne sous chaque jour
 * de la semaine (matin, soir, nuit : présents / attendus, dans l'ordre de
 * `ORDRE_PERIODES`, déjà trié par `bilanPresence`) et une forme par consigne
 * sous ceux du mois (rond le jour, triangle la nuit). Les écarts vont dans « Points d'attention »
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
import type { Transmissions } from '#/lib/planning/verificateur.ts'
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

const PASSAGE = {
  nuitMatin: 'Transmission nuit → matin',
  matinSoir: 'Transmission matin → soir',
  soirNuit: 'Transmission soir → nuit',
} as const

type PeriodeMois = (typeof PERIODES)[number]

/** Couleur d'un moment : vert conforme, rouge il manque du monde, bleu plus
 * que demandé, orange vide quand rien n'est demandé. */
function teinte(p: PresenceOut | undefined): string {
  if (!p) return 'text-amber-500'
  if (p.ecart < 0) return 'text-red-500'
  if (p.ecart > 0) return 'text-sky-500'
  return 'text-emerald-500'
}

/** Une FORME par moment (demande utilisateur du 2026-11-03, « plus de
 * dots, la nuit un triangle, la journée un rond ») : un rond pour le matin
 * et le soir, un triangle pour la nuit. Pleine de sa couleur, juste dessinée
 * quand rien n'est demandé. */
function Forme({
  periode,
  p,
}: {
  periode: PeriodeMois
  p: PresenceOut | undefined
}) {
  return (
    <svg
      aria-hidden
      data-periode={periode}
      viewBox="0 0 10 10"
      className={cn('size-2.5 shrink-0', teinte(p))}
    >
      {periode === 'nuit' ? (
        <path
          d="M5 1.2 9.2 8.8H0.8Z"
          strokeLinejoin="round"
          strokeWidth={1.4}
          stroke="currentColor"
          fill={p ? 'currentColor' : 'none'}
        />
      ) : (
        <circle
          cx="5"
          cy="5"
          r="3.8"
          strokeWidth={1.4}
          stroke="currentColor"
          fill={p ? 'currentColor' : 'none'}
        />
      )}
    </svg>
  )
}

const ligne = (periode: PeriodeMois, p: PresenceOut | undefined) =>
  p
    ? `${NOM[periode]} : ${p.compte} pour ${libelleConsigne(p.minimum, p.maximum)}${p.ecart ? ` (${ecartTexte(p.ecart)})` : ''}`
    : `${NOM[periode]} : ${RIEN}`

/** Vue mois : sous le numéro du jour, trois formes côte à côte, matin et
 * soir en rond, nuit en triangle. Le fil d'un jour à l'autre et la nuit à
 * cheval sur deux jours (essayés le 2026-11-03) sont RETIRÉS à la demande de
 * l'utilisateur (« très confusant ») : les transmissions ne sont plus que
 * dans l'infobulle. Rien tant que la semaine n'est pas lue. */
export function PointsPresence({
  presence,
  transmissions,
}: {
  presence: PresenceOut[] | undefined
  transmissions?: Omit<Transmissions, 'jour'>
}) {
  if (!presence) return null
  const de = (periode: PeriodeMois) =>
    presence.find((x) => x.periode === periode)
  const lignes = PERIODES.map((periode) => ligne(periode, de(periode)))
  if (transmissions)
    for (const cle of ['nuitMatin', 'matinSoir', 'soirNuit'] as const) {
      const e = transmissions[cle]
      if (e)
        lignes.push(
          `${PASSAGE[cle]} : ${e === 'ok' ? 'assurée' : 'personne pour la faire'}`,
        )
    }
  return (
    <Tip
      label={<span className="whitespace-pre-line">{lignes.join('\n')}</span>}
    >
      <span
        tabIndex={0}
        aria-label={lignes.join(', ')}
        className="mt-1 flex h-3 items-center justify-center gap-1"
      >
        {PERIODES.map((periode) => (
          <Forme key={periode} periode={periode} p={de(periode)} />
        ))}
      </span>
    </Tip>
  )
}

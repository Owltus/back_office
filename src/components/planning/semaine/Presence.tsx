/*
 * Personnes par cycle à l'écran : une pastille par consigne sous chaque jour
 * de la semaine (matin, soir, nuit : présents / attendus, dans l'ordre de
 * `ORDRE_PERIODES`, déjà trié par `bilanPresence`) et un point par consigne
 * sous ceux du mois, reliés d'un jour à l'autre, la nuit à cheval sur deux
 * jours. Les écarts vont dans « Points d'attention »
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

/** Le trait entre deux points, étiré jusqu'à eux : plein vert quand la
 * transmission est assurée, pointillé rouge quand personne n'est là pour la
 * faire, gris pâle quand une des deux équipes est absente (le fil continue,
 * rien n'est à transmettre). */
function Lien({ etat }: { etat: EtatTransmission | undefined }) {
  return (
    <span
      aria-hidden
      data-transmission={etat ?? 'aucune'}
      className={cn(
        'h-0 min-w-1 flex-1 self-center rounded-full border-t-2',
        etat === 'ok' && 'border-emerald-500/70',
        etat === 'manque' && 'border-dashed border-red-500/90',
        !etat && 'border-foreground/10',
      )}
    />
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

/** Un point pour le matin et le soir ; un CROISSANT DE LUNE pour la nuit
 * (demande utilisateur du 2026-11-03), plein de sa couleur, juste dessiné
 * quand rien n'est demandé. Un halo de la couleur du bandeau le détache du
 * fil et de la frontière entre deux jours. */
function Point({
  periode,
  p,
  className,
  data = periode,
}: {
  periode: PeriodeMois
  p: PresenceOut | undefined
  className?: string
  data?: string
}) {
  if (periode === 'nuit')
    return (
      <span
        data-periode={data}
        className={cn(
          'flex size-3.5 shrink-0 items-center justify-center rounded-full bg-muted',
          teinte(p),
          className,
        )}
      >
        <Moon
          aria-hidden
          strokeWidth={2.25}
          className={cn('size-3 -rotate-12', p && 'fill-current')}
        />
      </span>
    )
  return (
    <span
      data-periode={data}
      className={cn(
        'size-2 shrink-0 rounded-full ring-2 ring-muted',
        teinte(p),
        p ? 'bg-current' : 'border border-current bg-muted',
        className,
      )}
    />
  )
}

const ligne = (periode: PeriodeMois, p: PresenceOut | undefined) =>
  p
    ? `${NOM[periode]} : ${p.compte} pour ${libelleConsigne(p.minimum, p.maximum)}${p.ecart ? ` (${ecartTexte(p.ecart)})` : ''}`
    : `${NOM[periode]} : ${RIEN}`

/** Vue mois : sous le numéro du jour, le matin et le soir, puis la NUIT posée
 * À CHEVAL sur la frontière avec le lendemain (elle commence un jour et finit
 * le suivant ; demande utilisateur du 2026-11-03). Un seul fil court d'un
 * jour à l'autre : nuit d'avant, matin, soir, nuit, chaque tronçon coloré
 * par sa transmission (« un lien quand il y a quelqu'un pour faire les
 * transmissions », 2026-11-02). La nuit d'un jour est dessinée dans la case
 * du LENDEMAIN (`veille`), au bord gauche : peinte après sa voisine, elle
 * passe par-dessus la frontière ; la dernière colonne dessine la sienne
 * (`derniere`). Rien tant que la semaine n'est pas lue. */
export function PointsPresence({
  presence,
  transmissions,
  veille,
  derniere = false,
}: {
  presence: PresenceOut[] | undefined
  transmissions?: Omit<Transmissions, 'jour'>
  /** La présence de la veille (colonne d'avant) : sa nuit se pose ici, au
   * bord gauche. Absente : première colonne, ou veille pas encore lue. */
  veille?: PresenceOut[]
  /** Dernière colonne : sa nuit se pose au bord droit, dans sa case. */
  derniere?: boolean
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
  const nuitAvant = veille?.find((x) => x.periode === 'nuit')
  if (transmissions && veille)
    lignes.unshift(`${ligne('nuit', nuitAvant)} (la veille)`)
  const centre = 'absolute top-1/2 -translate-y-1/2'
  return (
    <Tip
      label={<span className="whitespace-pre-line">{lignes.join('\n')}</span>}
    >
      <span
        tabIndex={0}
        aria-label={lignes.join(', ')}
        className={cn(
          'mt-1 flex h-3.5 items-center',
          transmissions ? 'relative w-full' : 'justify-center gap-0.5',
        )}
      >
        {transmissions ? (
          <>
            <Lien etat={transmissions.nuitMatin} />
            <Point periode="matin" p={de('matin')} />
            <Lien etat={transmissions.matinSoir} />
            <Point periode="soir" p={de('soir')} />
            <Lien etat={transmissions.soirNuit} />
            {veille && (
              <Point
                periode="nuit"
                p={nuitAvant}
                data="nuit-veille"
                className={cn(centre, 'left-0 z-10 -translate-x-1/2')}
              />
            )}
            {derniere && (
              <Point
                periode="nuit"
                p={de('nuit')}
                className={cn(centre, 'right-0 z-10 translate-x-1/2')}
              />
            )}
          </>
        ) : (
          PERIODES.map((periode) => (
            <Point key={periode} periode={periode} p={de(periode)} />
          ))
        )}
      </span>
    </Tip>
  )
}

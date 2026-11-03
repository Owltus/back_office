/*
 * Personnes par cycle à l'écran : une pastille par consigne sous chaque jour
 * de la semaine (matin, soir, nuit : présents / attendus, dans l'ordre de
 * `ORDRE_PERIODES`, déjà trié par `bilanPresence`) et une forme par consigne
 * sous ceux du mois (rond le jour, triangle la nuit à cheval sur deux
 * jours, reliés d'un jour à l'autre). Les écarts vont dans « Points d'attention »
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

/** Le trait entre deux formes, posé en PROPORTION de la case (`place`) :
 * plein vert quand la transmission est assurée, pointillé rouge quand
 * personne n'est là pour la faire, gris pâle quand une des deux équipes est
 * absente (le fil continue, rien n'est à transmettre). Fin (1 px) et centré
 * sur le milieu des formes (retour utilisateur du 2026-11-03 : « trop gros
 * et mal alignés »). Il court d'un centre de forme à l'autre, sous elles. */
function Lien({
  etat,
  place,
}: {
  etat: EtatTransmission | undefined
  place: string
}) {
  return (
    <span
      aria-hidden
      data-transmission={etat ?? 'aucune'}
      className={cn(
        'absolute top-1/2 h-0 -translate-y-1/2 border-t',
        place,
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

/** Une FORME par moment (demande utilisateur du 2026-11-03 : « la nuit un
 * triangle, la journée un rond ») : un rond pour le matin et le soir, un
 * triangle pour la nuit. Pleine de sa couleur, juste dessinée quand rien
 * n'est demandé. */
function Forme({
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
  const trait = {
    strokeWidth: 1.4,
    stroke: 'currentColor',
    fill: p ? 'currentColor' : 'var(--color-muted)',
  }
  return (
    <svg
      aria-hidden
      data-periode={data}
      viewBox="0 0 10 10"
      className={cn(
        'block shrink-0',
        // Taille bornée par la largeur de la case (`@container`) : une
        // fenêtre étroite rétrécit les formes au lieu de les faire se
        // chevaucher (retour utilisateur du 2026-11-03).
        periode === 'nuit'
          ? 'size-[min(0.75rem,26cqw)]'
          : 'size-[min(0.625rem,20cqw)]',
        teinte(p),
        className,
      )}
    >
      {periode === 'nuit' ? (
        <path d="M5 1.2 9.2 8.8H0.8Z" strokeLinejoin="round" {...trait} />
      ) : (
        <circle cx="5" cy="5" r="3.8" {...trait} />
      )}
    </svg>
  )
}

const ligne = (periode: PeriodeMois, p: PresenceOut | undefined) =>
  p
    ? `${NOM[periode]} : ${p.compte} pour ${libelleConsigne(p.minimum, p.maximum)}${p.ecart ? ` (${ecartTexte(p.ecart)})` : ''}`
    : `${NOM[periode]} : ${RIEN}`

/** Vue mois (demandes utilisateur du 2026-11-03) : sous le numéro du jour,
 * le matin et le soir en deux ronds ; la NUIT en triangle posé sur la
 * FRONTIÈRE avec le lendemain (elle commence un jour et finit le suivant).
 * Tout est placé en PROPORTION de la case, à intervalles égaux (nuit 0,
 * matin 1/3, soir 2/3, nuit 1) : même dessin quelle que soit la largeur de
 * la fenêtre. Un fil continu d'un jour à
 * l'autre : nuit d'avant, matin, soir, nuit, chaque tronçon coloré par sa
 * transmission. La nuit d'un jour est dessinée dans la case du LENDEMAIN
 * (`veille`), au bord gauche : peinte après sa voisine, elle passe
 * par-dessus la frontière ; la dernière colonne dessine la sienne
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
  const pose = 'absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2'
  return (
    <Tip
      label={<span className="whitespace-pre-line">{lignes.join('\n')}</span>}
    >
      <span
        tabIndex={0}
        aria-label={lignes.join(', ')}
        className={cn(
          'mt-1 flex h-3 items-center',
          transmissions ? 'relative w-full @container' : 'justify-center gap-1',
        )}
      >
        {transmissions ? (
          <>
            <Lien etat={transmissions.nuitMatin} place="left-0 right-2/3" />
            <Lien etat={transmissions.matinSoir} place="left-1/3 right-1/3" />
            <Lien etat={transmissions.soirNuit} place="left-2/3 right-0" />
            <Forme
              periode="matin"
              p={de('matin')}
              className={cn(pose, 'left-1/3')}
            />
            <Forme
              periode="soir"
              p={de('soir')}
              className={cn(pose, 'left-2/3')}
            />
            {veille && (
              <Forme
                periode="nuit"
                p={nuitAvant}
                data="nuit-veille"
                className={cn(pose, 'left-0')}
              />
            )}
            {derniere && (
              <Forme
                periode="nuit"
                p={de('nuit')}
                className={cn(pose, 'left-full')}
              />
            )}
          </>
        ) : (
          PERIODES.map((periode) => (
            <Forme key={periode} periode={periode} p={de(periode)} />
          ))
        )}
      </span>
    </Tip>
  )
}

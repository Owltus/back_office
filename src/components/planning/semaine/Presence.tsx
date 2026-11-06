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
 * l'accueil (2026-11-01) : un nombre exact, un middle ne compte nulle part
 * (2026-11-05), la nuit est celle des veilleurs.
 */

import { Moon, Sun, Sunset } from 'lucide-react'

import { useMoments } from '#/components/planning/hooks/useMoments.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import {
  estNuit,
  momentDe,
  momentsDeJour,
  momentsDuTableau,
  nuitsDuTableau,
} from '#/lib/planning/moment.ts'
import type { Moments } from '#/lib/planning/moment.ts'
import { libelleConsigne } from '#/lib/planning/presence.ts'
import type { PresenceOut } from '#/lib/planning/presence.ts'
import type {
  EtatTransmission,
  Transmissions,
} from '#/lib/planning/verificateur.ts'
import { cn } from '#/lib/utils.ts'

/** Nom d'un moment à l'écran. */
const nomDe = (l: Moments, p: string) => momentDe(l, p)?.nom ?? p

/** Icône d'un moment : la lune la nuit, le couchant pour le dernier moment
 * de jour, le soleil sinon. */
export function iconeDe(l: Moments, p: string) {
  if (estNuit(l, p)) return Moon
  const jour = momentsDeJour(l)
  return jour.length > 1 && jour[jour.length - 1] === p ? Sunset : Sun
}

/** « 1 de moins », « 2 de plus ». */
export function ecartTexte(ecart: number): string {
  return ecart < 0 ? `${-ecart} de moins` : `${ecart} de plus`
}

/** Un moment où personne n'est demandé (audit RH du 2026-11-01) : l'hôtel
 * peut rester vide, comme le dit le rond orange du mois. */
const RIEN = "personne de demandé, l'hôtel peut rester vide"

export function PastillesPresence({
  presence,
  moments: donnes,
}: {
  presence: PresenceOut[]
  moments?: Moments
}) {
  const lus = useMoments()
  const moments = donnes ?? lus
  if (!presence.length) return null
  const absents = momentsDuTableau(moments).filter(
    (m) => !presence.some((p) => p.periode === m),
  )
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {absents.map((m) => {
        const Icone = iconeDe(moments, m)
        const texte = `${nomDe(moments, m)} : ${RIEN}`
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
        const Icone = iconeDe(moments, p.periode)
        const attendu = libelleConsigne(p.minimum, p.maximum)
        const texte = `${nomDe(moments, p.periode)} : ${p.compte} présent${p.compte > 1 ? 's' : ''} pour ${attendu} demandé${p.minimum > 1 ? 's' : ''}${p.ecart ? ` (${ecartTexte(p.ecart)})` : ''}`
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
  de,
  a,
}: {
  etat: EtatTransmission | undefined
  /** Bords du trait, en proportion de la case (0 à 1). */
  de: number
  a: number
}) {
  const p = placeTrait(de, a)
  return (
    <span
      aria-hidden
      data-transmission={etat ?? 'aucune'}
      style={p.style}
      className={cn(
        'absolute top-1/2 h-0 -translate-y-1/2 border-t',
        p.className,
        etat === 'ok' && 'border-emerald-500/70',
        etat === 'manque' && 'border-dashed border-red-500/90',
        !etat && 'border-foreground/10',
      )}
    />
  )
}

// Les tiers de la case, en classes (les positions de l'hôtel) ; une autre
// position, en style.
const GAUCHE: Record<string, string> = {
  '0': 'left-0',
  '0.333': 'left-1/3',
  '0.667': 'left-2/3',
  '1': 'left-full',
}
const DROITE: Record<string, string> = {
  '0': 'right-0',
  '0.333': 'right-1/3',
  '0.667': 'right-2/3',
}
const cle = (f: number) => String(Math.round(f * 1000) / 1000)

/** Place d'une forme (son centre) en proportion de la case. */
function placeForme(f: number) {
  const g = GAUCHE[cle(f)] as string | undefined
  return g
    ? { className: g, style: undefined }
    : { className: '', style: { left: `${f * 100}%` } }
}

/** Place d'un trait de `de` à `a`. */
function placeTrait(de: number, a: number) {
  const g = GAUCHE[cle(de)] as string | undefined
  const d = DROITE[cle(1 - a)] as string | undefined
  return g && d
    ? { className: `${g} ${d}`, style: undefined }
    : {
        className: '',
        style: { left: `${de * 100}%`, right: `${(1 - a) * 100}%` },
      }
}

/** Les trois passages, nommés par les moments : nuit → premier, premier →
 * dernier, dernier → nuit (à l'hôtel : nuit → matin, matin → soir, soir →
 * nuit). */
function passages(l: Moments) {
  const jour = momentsDeJour(l)
  const nuit = nuitsDuTableau(l)[0]
  const n = (p: string | undefined) =>
    p === undefined ? '' : nomDe(l, p).toLocaleLowerCase('fr-FR')
  const premier = n(jour[0])
  const dernier = n(jour[jour.length - 1])
  return {
    nuitMatin: `Transmission ${n(nuit)} → ${premier}`,
    matinSoir: `Transmission ${premier} → ${dernier}`,
    soirNuit: `Transmission ${dernier} → ${n(nuit)}`,
  } as const
}

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
  nuit,
  className,
  style,
  data = periode,
}: {
  periode: string
  p: PresenceOut | undefined
  /** C'est un moment de nuit (triangle). */
  nuit: boolean
  className?: string
  style?: React.CSSProperties
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
      style={style}
      className={cn(
        'block shrink-0',
        // Taille bornée par la largeur de la case (`@container`) : une
        // fenêtre étroite rétrécit les formes au lieu de les faire se
        // chevaucher (retour utilisateur du 2026-11-03).
        nuit ? 'size-[min(0.75rem,26cqw)]' : 'size-[min(0.625rem,20cqw)]',
        teinte(p),
        className,
      )}
    >
      {nuit ? (
        <path d="M5 1.2 9.2 8.8H0.8Z" strokeLinejoin="round" {...trait} />
      ) : (
        <circle cx="5" cy="5" r="3.8" {...trait} />
      )}
    </svg>
  )
}

const ligne = (l: Moments, periode: string, p: PresenceOut | undefined) =>
  p
    ? `${nomDe(l, periode)} : ${p.compte} pour ${libelleConsigne(p.minimum, p.maximum)}${p.ecart ? ` (${ecartTexte(p.ecart)})` : ''}`
    : `${nomDe(l, periode)} : ${RIEN}`

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
  moments: donnes,
}: {
  /** Les moments de l'établissement (le tableau). */
  moments?: Moments
  presence: PresenceOut[] | undefined
  transmissions?: Omit<Transmissions, 'jour'>
  /** La présence de la veille (colonne d'avant) : sa nuit se pose ici, au
   * bord gauche. Absente : première colonne, ou veille pas encore lue. */
  veille?: PresenceOut[]
  /** Dernière colonne : sa nuit se pose au bord droit, dans sa case. */
  derniere?: boolean
}) {
  const lus = useMoments()
  if (!presence) return null
  const l = donnes ?? lus
  const de = (periode: string) => presence.find((x) => x.periode === periode)
  const tableau = momentsDuTableau(l)
  const jour = momentsDeJour(l)
  const nuit = nuitsDuTableau(l)[0] as string | undefined
  // Les moments de jour à intervalles égaux entre les deux nuits (à
  // l'hôtel : matin 1/3, soir 2/3).
  const x = (i: number) => (i + 1) / (jour.length + 1)
  const PASSAGE = passages(l)
  const lignes = tableau.map((periode) => ligne(l, periode, de(periode)))
  if (transmissions)
    for (const c of ['nuitMatin', 'matinSoir', 'soirNuit'] as const) {
      const e = transmissions[c]
      if (e)
        lignes.push(
          `${PASSAGE[c]} : ${e === 'ok' ? 'assurée' : 'personne pour la faire'}`,
        )
    }
  const nuitAvant =
    nuit === undefined ? undefined : veille?.find((v) => v.periode === nuit)
  if (transmissions && veille && nuit !== undefined)
    lignes.unshift(`${ligne(l, nuit, nuitAvant)} (la veille)`)
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
            {jour.length > 0 && (
              <>
                <Lien etat={transmissions.nuitMatin} de={0} a={x(0)} />
                <Lien
                  etat={transmissions.matinSoir}
                  de={x(0)}
                  a={x(jour.length - 1)}
                />
                <Lien
                  etat={transmissions.soirNuit}
                  de={x(jour.length - 1)}
                  a={1}
                />
              </>
            )}
            {jour.map((periode, i) => {
              const p = placeForme(x(i))
              return (
                <Forme
                  key={periode}
                  periode={periode}
                  nuit={false}
                  p={de(periode)}
                  style={p.style}
                  className={cn(pose, p.className)}
                />
              )
            })}
            {veille && nuit !== undefined && (
              <Forme
                periode={nuit}
                nuit
                p={nuitAvant}
                data={`${nuit}-veille`}
                className={cn(pose, 'left-0')}
              />
            )}
            {derniere && nuit !== undefined && (
              <Forme
                periode={nuit}
                nuit
                p={de(nuit)}
                className={cn(pose, 'left-full')}
              />
            )}
          </>
        ) : (
          tableau.map((periode) => (
            <Forme
              key={periode}
              periode={periode}
              nuit={estNuit(l, periode)}
              p={de(periode)}
            />
          ))
        )}
      </span>
    </Tip>
  )
}

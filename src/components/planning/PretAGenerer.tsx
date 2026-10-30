/*
 * Prêt à générer (plan `planning-coherence-2026-10-28`, étape 7, D6 = A,
 * D17, D18). Relit les points de `verifierReglages` pour la page Planning :
 *
 * - tant qu'il manque un code, un poste ou une personne sur un poste (on ne
 *   pourrait rien poser), une semaine ou un mois SANS shift montre la carte
 *   « Pour commencer » à la place de la grille vide : les quatre réglages
 *   dans l'ordre, chacun coché ou avec son bouton (« Voir » sans droit de
 *   régler). Sinon (aucun besoin, ou besoins tous écartés ; planning déjà
 *   rempli), la grille reste visible et utilisable à la main, avec un
 *   bandeau compact au-dessus ;
 * - le bouton de génération est grisé, la raison écrite (infobulle et texte
 *   lu par les lecteurs d'écran), le lien est sur la carte ou le bandeau ;
 * - s'il reste des points « à voir », la génération demande d'abord une
 *   confirmation légère (points repliés, « Générer quand même »). Une fois
 *   confirmée, la même liste de points (mêmes points, mêmes textes) ne la
 *   redemande plus tant que la vue est ouverte : on ne repose pas la
 *   question à chaque semaine. L'accord vit dans l'état de la vue, jamais
 *   au niveau du module : un autre compte, ou une autre ouverture, le
 *   redemande.
 *   Sans point à voir, la génération part directement, comme avant.
 */

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Check, ChevronDown, OctagonAlert } from 'lucide-react'

import { useNotifier } from '#/components/planning/Messages.tsx'
import {
  PanneauControle,
  usePointsReglages,
} from '#/components/planning/parametres/ControleReglages.tsx'
import { useAujourdhui } from '#/components/planning/hooks/usePlanning.ts'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import {
  LIBELLE_ECRAN,
  ORDRE_ECRANS,
  PAGE_ECRAN,
  besoinsDemandes,
  ordonnerPoints,
} from '#/lib/planning/coherence.ts'
import type {
  EcranReglage,
  LienReglage,
  PointReglage,
} from '#/lib/planning/coherence.ts'
import type { Referentiel } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

export interface EtapeDemarrage {
  ecran: EcranReglage
  numero: number
  libelle: string
  /** Ce que l'étape règle, en une phrase. */
  aide: string
  fait: boolean
  /** Ce qui manque (étape à faire) ou ce qui est réglé (étape faite). */
  etat: string
  lien: LienReglage
}

const AIDE_ETAPE: Record<EcranReglage, string> = {
  horaires: "Les codes horaires de l'hôtel : matin, soir, nuit.",
  postes: 'Les postes à tenir et les codes qu’ils utilisent.',
  equipe: 'Chaque personne et les postes qu’elle tient.',
  besoins: 'Combien de personnes il faut, par poste et par jour.',
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/**
 * Les quatre réglages dans l'ordre. Une étape est faite quand elle n'a plus
 * de point bloquant ; Équipe et Besoins demandent en plus qu'un poste existe
 * (sans poste, `verifierReglages` ne les signale pas : ils ne sont pas faits
 * pour autant). Les points « à voir » ne décochent pas une étape : ils se
 * lisent dans le panneau À vérifier.
 */
export function etapesDemarrage(
  r: Referentiel,
  points: readonly PointReglage[],
): EtapeDemarrage[] {
  const sansPoste = !r.postes.length
  const nbPlaces = new Set(
    r.salaries.filter((s) => s.competences.length).map((s) => s.id),
  ).size
  // Les besoins que le moteur retient, comme le point bloquant.
  const nbBesoins = besoinsDemandes(r).length
  const reglees: Record<EcranReglage, string> = {
    horaires: pluriel(r.horaires.length, 'code horaire'),
    postes: pluriel(r.postes.length, 'poste'),
    equipe: `${pluriel(nbPlaces, 'personne')} sur un poste`,
    besoins: pluriel(nbBesoins, 'besoin'),
  }
  return ORDRE_ECRANS.map((ecran, i) => {
    const bloquant = points.find(
      (p) => p.ecran === ecran && p.gravite === 'bloquant',
    )
    const attendPoste = sansPoste && (ecran === 'equipe' || ecran === 'besoins')
    const fait = !bloquant && !attendPoste
    return {
      ecran,
      numero: i + 1,
      libelle: LIBELLE_ECRAN[ecran],
      aide: AIDE_ETAPE[ecran],
      fait,
      etat: fait
        ? reglees[ecran]
        : (bloquant?.texte ?? "Créez d'abord les postes."),
      lien: bloquant?.lien ?? { page: PAGE_ECRAN[ecran] },
    }
  })
}

export interface Blocage {
  /** Raison affichée sur le bouton grisé. */
  texte: string
  lien: LienReglage
}

/** Le premier point bloquant, dans l'ordre de réglage (null : rien ne
 * bloque). */
export function blocageGeneration(
  points: readonly PointReglage[],
): Blocage | null {
  const p = ordonnerPoints(points.filter((x) => x.gravite === 'bloquant')).at(0)
  return p
    ? {
        texte: `Génération impossible, un réglage manque : ${p.texte}`,
        lien: p.lien,
      }
    : null
}

export interface EtatGeneration {
  /** null tant que le référentiel n'est pas lu. */
  points: PointReglage[] | null
  etapes: EtapeDemarrage[]
  blocage: Blocage | null
  /** Il manque un code, un poste ou une personne sur un poste : la grille
   * ne permettrait de rien poser. */
  grilleInutile: boolean
  aVoir: PointReglage[]
}

/** Écrans dont un bloquant rend la grille inutile (rien à poser). Un
 * besoin qui manque n'empêche pas de poser à la main. */
const SANS_GRILLE: readonly EcranReglage[] = ['horaires', 'postes', 'equipe']

export function grilleInutile(points: readonly PointReglage[]): boolean {
  return points.some(
    (p) => p.gravite === 'bloquant' && SANS_GRILLE.includes(p.ecran),
  )
}

/** Ce que la page Planning doit savoir des réglages avant de générer. */
export function usePretAGenerer(
  referentiel: Referentiel | undefined | null,
): EtatGeneration {
  const aujourdhui = useAujourdhui()
  const points = usePointsReglages(referentiel ?? undefined, aujourdhui)
  return useMemo(
    () => ({
      points,
      etapes: referentiel && points ? etapesDemarrage(referentiel, points) : [],
      blocage: points ? blocageGeneration(points) : null,
      grilleInutile: points ? grilleInutile(points) : false,
      aVoir: points ? points.filter((p) => p.gravite === 'a-voir') : [],
    }),
    [referentiel, points],
  )
}

/** Ouvre l'écran de réglage d'un point (`?ouvrir=`). */
export function useAllerAuReglage() {
  const navigate = useNavigate()
  return (lien: LienReglage) =>
    void navigate({
      to: lien.page,
      search: lien.cible ? { ouvrir: lien.cible } : {},
    })
}

// ------------------------------------------------------------ affichage

/** La carte « Pour commencer », à la place d'une grille vide. */
export function PourCommencer({
  etapes,
  onAller,
  modifiable = true,
}: {
  etapes: EtapeDemarrage[]
  onAller: (lien: LienReglage) => void
  /** Droit de régler les paramètres ; sans lui, « Voir ». */
  modifiable?: boolean
}) {
  const verbe = modifiable ? 'Régler' : 'Voir'
  const suivante = etapes.find((e) => !e.fait)
  return (
    <section
      aria-labelledby="pour-commencer-titre"
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-xl border bg-card p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="pour-commencer-titre" className="text-base font-semibold">
          Pour commencer
        </h2>
        <p className="text-sm text-muted-foreground">
          {modifiable
            ? 'Réglez ces quatre points, dans l’ordre. Le planning automatique pourra ensuite proposer les shifts.'
            : 'Ces quatre points sont à régler, dans l’ordre, par un responsable du planning. Vous pouvez les consulter.'}
        </p>
      </div>
      <ol className="divide-y overflow-hidden rounded-lg border">
        {etapes.map((e) => (
          <li
            key={e.ecran}
            data-etape={e.ecran}
            data-fait={e.fait || undefined}
            className="flex items-center gap-3 px-3 py-3"
          >
            <span
              aria-hidden
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
                e.fait
                  ? 'border-emerald-600/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'text-muted-foreground',
              )}
            >
              {e.fait ? <Check className="size-4" /> : e.numero}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                <span className="sr-only">{`Étape ${e.numero} : `}</span>
                {e.libelle}
                <span className="sr-only">
                  {e.fait ? ', réglé.' : ', à régler.'}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {e.fait ? e.etat : `${e.aide} ${e.etat}`}
              </p>
            </div>
            {e.fait ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                Réglé
              </span>
            ) : (
              <Button
                size="sm"
                variant={e === suivante ? 'default' : 'outline'}
                className="shrink-0"
                aria-label={`${verbe} : ${e.libelle}`}
                onClick={() => onAller(e.lien)}
              >
                {verbe}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Bandeau compact au-dessus d'un planning déjà rempli. */
export function BandeauReglages({
  blocage,
  onAller,
}: {
  blocage: Blocage
  onAller: (lien: LienReglage) => void
}) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
    >
      <OctagonAlert className="size-4 shrink-0 text-destructive" aria-hidden />
      <p className="min-w-0 flex-1">{blocage.texte}</p>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => onAller(blocage.lien)}
      >
        Corriger
      </Button>
    </div>
  )
}

/**
 * Enveloppe la grille : carte « Pour commencer » si un réglage manque et que
 * rien n'est encore posé, bandeau au-dessus de la grille si un planning
 * existe déjà, la grille seule sinon.
 */
export function GardeDemarrage({
  etat,
  vide,
  modifiable = true,
  children,
}: {
  etat: EtatGeneration
  /** Aucun shift dans ce qui est affiché. */
  vide: boolean
  /** Droit de régler les paramètres (sinon « Voir »). */
  modifiable?: boolean
  children: ReactNode
}) {
  const aller = useAllerAuReglage()
  if (!etat.blocage) return <>{children}</>
  if (vide && etat.grilleInutile) {
    return (
      <PourCommencer
        etapes={etat.etapes}
        onAller={aller}
        modifiable={modifiable}
      />
    )
  }
  return (
    <>
      <BandeauReglages blocage={etat.blocage} onAller={aller} />
      {children}
    </>
  )
}

// ------------------------------------------------------------ confirmation

/** Ce qu'on a accepté : chaque point, avec son texte (un point dont le
 * chiffre change, il manque 12 h devenu 40 h, redemande). */
export function signaturePoints(points: readonly PointReglage[]): string {
  return points
    .map((p) => `${p.id}\u0000${p.texte}`)
    .sort()
    .join('\u0001')
}

/**
 * `demander(lancer)` : refuse s'il reste un bloquant (message dans le fil),
 * lance directement s'il n'y a rien à voir (ou si cette liste a déjà été
 * acceptée), sinon ouvre la confirmation. Monter `dialogue` une fois.
 */
export function useConfirmationGeneration(etat: EtatGeneration) {
  const notifier = useNotifier()
  const aller = useAllerAuReglage()
  const [attente, setAttente] = useState<(() => void) | null>(null)
  // Dernière liste acceptée, dans l'état de la vue (semaine ou mois) : elle
  // survit au changement de semaine, pas à la fermeture de la vue.
  const [acceptee, setAcceptee] = useState<string | null>(null)
  const demander = (lancer: () => void) => {
    if (etat.blocage) {
      notifier(etat.blocage.texte, 'attention')
      return
    }
    if (!etat.aVoir.length || acceptee === signaturePoints(etat.aVoir)) {
      lancer()
      return
    }
    setAttente(() => lancer)
  }
  const dialogue = (
    <ConfirmationGeneration
      ouvert={!!attente}
      points={etat.aVoir}
      onFermer={() => setAttente(null)}
      onGenerer={() => {
        const lancer = attente
        setAcceptee(signaturePoints(etat.aVoir))
        setAttente(null)
        lancer?.()
      }}
      onAller={(lien) => {
        setAttente(null)
        aller(lien)
      }}
    />
  )
  return { demander, dialogue }
}

export function ConfirmationGeneration({
  ouvert,
  points,
  onFermer,
  onGenerer,
  onAller,
}: {
  ouvert: boolean
  points: PointReglage[]
  onFermer: () => void
  onGenerer: () => void
  onAller: (lien: LienReglage) => void
}) {
  const [deplie, setDeplie] = useState(false)
  const fermer = () => {
    setDeplie(false)
    onFermer()
  }
  const n = points.length
  const resume = `${n} point${n > 1 ? 's' : ''} à vérifier`
  return (
    <Dialog
      open={ouvert}
      onOpenChange={(o) => {
        if (!o) fermer()
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Générer le planning ?</DialogTitle>
          <DialogDescription>
            {resume} dans les réglages. Ils n’empêchent pas de générer, mais le
            résultat peut s’en ressentir. Les données à ranger, des shifts déjà
            posés, ne sont pas comptées ici : elles restent dans À vérifier. Les
            shifts générés restent des propositions : vous les relisez et les
            validez ensuite.
          </DialogDescription>
        </DialogHeader>
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          aria-expanded={deplie}
          onClick={() => setDeplie((d) => !d)}
        >
          <ChevronDown
            className={cn('transition-transform', deplie && 'rotate-180')}
          />
          {deplie
            ? n > 1
              ? 'Masquer les points'
              : 'Masquer le point'
            : n > 1
              ? `Voir les ${resume}`
              : 'Voir le point à vérifier'}
        </Button>
        {deplie && (
          <div className="min-h-0 overflow-y-auto">
            <PanneauControle points={points} onAller={onAller} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={fermer}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              setDeplie(false)
              onGenerer()
            }}
          >
            Générer quand même
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/*
 * Prêt à générer (plan `planning-coherence-2026-10-28`, étape 7, D6 = A,
 * D17, D18). Relit les points de `verifierReglages` pour la page Planning :
 *
 * - tant qu'un point BLOQUANT reste (aucun code, aucun poste, personne sur
 *   un poste, aucun besoin), une semaine ou un mois SANS shift montre la
 *   carte « Pour commencer » à la place de la grille vide : les quatre
 *   réglages dans l'ordre, chacun coché ou avec son bouton. Un planning déjà
 *   rempli reste visible, avec un bandeau compact au-dessus ;
 * - le bouton de génération est grisé, la raison écrite (infobulle et texte
 *   lu par les lecteurs d'écran), le lien est sur la carte ou le bandeau ;
 * - s'il reste des points « à voir », la génération demande d'abord une
 *   confirmation légère (points repliés, « Générer quand même »). Une fois
 *   confirmée, la même liste de points ne la redemande plus jusqu'au
 *   rechargement de la page : on ne repose pas la question à chaque clic.
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
  const nbBesoins = r.besoins.filter((b) => b.effectif > 0).length
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
  const p = ordonnerPoints(points.filter((x) => x.gravite === 'bloquant'))[0]
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
  aVoir: PointReglage[]
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
}: {
  etapes: EtapeDemarrage[]
  onAller: (lien: LienReglage) => void
}) {
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
          Réglez ces quatre points, dans l’ordre. Le planning automatique pourra
          ensuite proposer les shifts.
        </p>
      </div>
      <ol className="divide-y overflow-hidden rounded-lg border">
        {etapes.map((e) => (
          <li
            key={e.ecran}
            aria-label={`${e.numero}. ${e.libelle}${e.fait ? ', réglé' : ', à régler'}`}
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
              <p className="text-sm font-medium">{e.libelle}</p>
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
                aria-label={`Régler : ${e.libelle}`}
                onClick={() => onAller(e.lien)}
              >
                Régler
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
  children,
}: {
  etat: EtatGeneration
  /** Aucun shift dans ce qui est affiché. */
  vide: boolean
  children: ReactNode
}) {
  const aller = useAllerAuReglage()
  if (!etat.blocage) return <>{children}</>
  if (vide) return <PourCommencer etapes={etat.etapes} onAller={aller} />
  return (
    <>
      <BandeauReglages blocage={etat.blocage} onAller={aller} />
      {children}
    </>
  )
}

// ------------------------------------------------------------ confirmation

/** Listes de points déjà acceptées (« Générer quand même ») depuis le
 * chargement de la page. */
const acceptees = new Set<string>()
const signature = (points: readonly PointReglage[]) =>
  points
    .map((p) => p.id)
    .sort()
    .join('|')

/** Pour les tests : oublie les confirmations données. */
export function oublierConfirmationsGeneration() {
  acceptees.clear()
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
  const demander = (lancer: () => void) => {
    if (etat.blocage) {
      notifier(etat.blocage.texte, 'attention')
      return
    }
    if (!etat.aVoir.length || acceptees.has(signature(etat.aVoir))) {
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
        acceptees.add(signature(etat.aVoir))
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
            résultat peut s’en ressentir. Les shifts générés restent des
            propositions : vous les relisez et les validez ensuite.
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
          {deplie ? 'Masquer les points' : `Voir les ${resume}`}
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

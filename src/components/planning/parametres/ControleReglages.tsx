/*
 * Panneau « À vérifier » des paramètres du planning (plan
 * `planning-coherence-2026-10-28`, étape 5, D17) : les points de
 * `verifierReglages`, groupés par écran, bloquants en tête, 5 visibles par
 * groupe puis « N de plus ». Chaque point a un bouton qui ouvre l'écran et
 * le réglage concerné (`?ouvrir=`). Ouvert depuis une pastille de l'en-tête
 * des paramètres. Rien n'empêche d'enregistrer : un point bloquant empêche
 * seulement de générer.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ChevronRight,
  CircleCheck,
  ListChecks,
  OctagonAlert,
} from 'lucide-react'

import {
  useAujourdhui,
  useReferentiel,
} from '#/components/planning/hooks/usePlanning.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet.tsx'
import { grouperPoints, verifierReglages } from '#/lib/planning/coherence.ts'
import type { LienReglage, PointReglage } from '#/lib/planning/coherence.ts'
import type { Referentiel } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

/** Points visibles par groupe avant « N de plus ». */
export const VISIBLES_PAR_GROUPE = 5

/** Les points des réglages, recalculés seulement quand ils changent. */
export function usePointsReglages(
  referentiel: Referentiel | undefined,
  aujourdhui?: string,
): PointReglage[] | null {
  return useMemo(
    () => (referentiel ? verifierReglages(referentiel, { aujourdhui }) : null),
    [referentiel, aujourdhui],
  )
}

/** La pastille de l'en-tête et son volet. */
export function ControleReglages() {
  const ref = useReferentiel()
  const aujourdhui = useAujourdhui()
  const points = usePointsReglages(ref.data, aujourdhui)
  const navigate = useNavigate()
  const [ouvert, setOuvert] = useState(false)
  if (!points) return null
  const bloquants = points.filter((p) => p.gravite === 'bloquant').length
  const aller = (lien: LienReglage) => {
    setOuvert(false)
    void navigate({
      to: lien.page,
      search: lien.cible ? { ouvrir: lien.cible } : {},
    })
  }
  const etiquette = points.length
    ? `À vérifier : ${points.length} point${points.length > 1 ? 's' : ''}`
    : 'Réglages cohérents : rien à vérifier'
  return (
    <>
      <Tip label={etiquette}>
        <Button
          variant="outline"
          size="sm"
          aria-label={etiquette}
          onClick={() => setOuvert(true)}
        >
          {points.length ? <ListChecks /> : <CircleCheck />}
          {points.length > 0 && (
            <span
              className={cn(
                'min-w-5 rounded-full px-1.5 text-xs leading-5 font-semibold tabular-nums',
                bloquants
                  ? 'bg-destructive text-white'
                  : 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
              )}
            >
              {points.length}
            </span>
          )}
        </Button>
      </Tip>
      <Sheet open={ouvert} onOpenChange={setOuvert}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>À vérifier</SheetTitle>
            <SheetDescription>
              Ce qui ne colle pas entre les réglages. Rien n'empêche
              d'enregistrer ; un point bloquant empêche de générer le planning.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4">
            <PanneauControle points={points} onAller={aller} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** La liste groupée des points (sans volet : rendue aussi par la boîte de
 * génération, étape 7). */
export function PanneauControle({
  points,
  onAller,
}: {
  points: PointReglage[]
  onAller: (lien: LienReglage) => void
}) {
  const groupes = useMemo(() => grouperPoints(points), [points])
  if (!points.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CircleCheck className="size-4 text-emerald-600" />
        Rien à vérifier : les réglages sont cohérents.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-5">
      {groupes.map((g) => (
        <GroupeControle
          key={g.ecran}
          libelle={g.libelle}
          points={g.points}
          onAller={onAller}
        />
      ))}
    </div>
  )
}

function GroupeControle({
  libelle,
  points,
  onAller,
}: {
  libelle: string
  points: PointReglage[]
  onAller: (lien: LienReglage) => void
}) {
  const [tout, setTout] = useState(false)
  const visibles = tout ? points : points.slice(0, VISIBLES_PAR_GROUPE)
  const reste = points.length - visibles.length
  return (
    <section aria-label={libelle} className="flex flex-col gap-2">
      <h3 className="flex items-baseline gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {libelle}
        <span className="font-normal tabular-nums">{points.length}</span>
      </h3>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {visibles.map((p) => (
          <li key={p.id} className="flex items-start gap-3 px-3 py-2.5">
            {p.gravite === 'bloquant' && (
              <OctagonAlert
                className="mt-0.5 size-4 shrink-0 text-destructive"
                aria-label="Bloquant"
              />
            )}
            <p className="min-w-0 flex-1 text-sm">
              {p.gravite === 'bloquant' && (
                <span className="font-semibold text-destructive">
                  Bloquant.{' '}
                </span>
              )}
              {p.texte}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              aria-label={`Corriger : ${p.texte}`}
              onClick={() => onAller(p.lien)}
            >
              Corriger
              <ChevronRight />
            </Button>
          </li>
        ))}
      </ul>
      {reste > 0 && (
        <Button
          variant="link"
          size="sm"
          className="self-start px-0"
          onClick={() => setTout(true)}
        >
          {reste} de plus
        </Button>
      )}
    </section>
  )
}

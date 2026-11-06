import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Loader2, Square } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { Button } from '#/components/ui/button.tsx'
import { cn } from '#/lib/utils.ts'
import { useMoments } from '#/components/planning/hooks/useMoments.ts'
import { momentsDuTableau } from '#/lib/planning/moment.ts'

/**
 * Fenêtre du calcul du planning (demande utilisateur du 2026-11-03 : « une
 * barre de progression, un genre de modal statique en plein milieu avec un
 * bouton direct pour stop »). Montée par la vue mois (« Compléter le mois »)
 * et par la vue semaine (« Compléter », « Tout recalculer »).
 *
 * Statique : ni Échap ni un clic dehors ne la ferment. Elle disparaît à la
 * fin du calcul, ou après « Arrêter le calcul ».
 *
 * Le solveur ne dit pas où il en est : la barre compte les SEMAINES faites,
 * et la semaine en cours se remplit avec son temps écoulé face à la limite
 * du calcul (`LIMITE_SECONDES`), jamais un faux pourcentage.
 *
 * SOBRE (demande utilisateur du 2026-11-03) : plus de titre « Compléter le
 * mois », ni « Semaine 2 sur 5 » avec la date, ni compteur « Cette
 * semaine », ni « 1 min au plus », ni phrase sur les propositions. Il reste
 * le dessin, la barre et le bouton d'arrêt.
 */

/** Limite du calcul d'une semaine (`tempsMaxSecondes` de semaine.ts). */
export const LIMITE_SECONDES = 60

const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export interface CalculEnCours {
  /** Ce qui est demandé : « Compléter le mois », « Compléter la semaine »
   * (nom accessible de la fenêtre seulement, plus affiché). */
  titre: string
  /** Semaine calculée, 1 à `n`. */
  i: number
  n: number
  /** Lundi de la semaine calculée (AAAA-MM-JJ). */
  lundi: string
}

export function FenetreCalcul({
  calcul,
  onArreter,
  maintenant = () => Date.now(),
}: {
  /** `null` : fenêtre fermée. */
  calcul: CalculEnCours | null
  onArreter: () => void
  /** Horloge, injectable pour les tests. */
  maintenant?: () => number
}) {
  const [arret, setArret] = useState(false)
  const [ecoule, setEcoule] = useState(0)
  const bouton = useRef<HTMLButtonElement>(null)
  const ouverte = calcul !== null
  const cle = calcul ? `${calcul.lundi}:${calcul.i}` : ''

  // Un nouveau calcul repart d'un bouton actif.
  useEffect(() => {
    if (!ouverte) setArret(false)
  }, [ouverte])

  // Temps de la semaine en cours : remis à zéro à chaque semaine, et
  // seulement alors (l'horloge passe par une référence : une fonction neuve à
  // chaque rendu relançait le compte à 0:00 à chaque rendu).
  const horloge = useRef(maintenant)
  horloge.current = maintenant
  useEffect(() => {
    if (!cle) return
    const debut = horloge.current()
    setEcoule(0)
    const t = setInterval(
      () => setEcoule((horloge.current() - debut) / 1000),
      250,
    )
    return () => clearInterval(t)
  }, [cle])

  // Un seul arrêt : le bouton se désactive aussitôt.
  const arreter = () => {
    setArret(true)
    onArreter()
  }

  const part = Math.min(1, ecoule / LIMITE_SECONDES)

  return (
    <DialogPrimitive.Root open={ouverte}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="planning-calcul-voile fixed inset-0 z-50 bg-background/70 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 print:hidden" />
        <DialogPrimitive.Content
          role="alertdialog"
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            bouton.current?.focus()
          }}
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-6 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 print:hidden"
        >
          {calcul && (
            <div className="flex flex-col gap-5">
              <SemaineQuiSeTisse arret={arret} />

              <DialogPrimitive.Title className="sr-only">
                {arret ? 'Arrêt en cours' : calcul.titre}
              </DialogPrimitive.Title>

              <div
                className="flex gap-1"
                role="progressbar"
                aria-label="Semaines calculées"
                aria-valuemin={0}
                aria-valuemax={calcul.n}
                aria-valuenow={calcul.i - 1}
                aria-valuetext={`${calcul.i - 1} sur ${calcul.n} terminée${calcul.i - 1 > 1 ? 's' : ''}`}
              >
                {Array.from({ length: calcul.n }, (_, k) => (
                  <div
                    key={k}
                    data-etat={
                      k < calcul.i - 1
                        ? 'faite'
                        : k === calcul.i - 1
                          ? 'en-cours'
                          : 'a-faire'
                    }
                    className={cn(
                      'relative h-2 flex-1 overflow-hidden rounded-full',
                      k < calcul.i - 1
                        ? 'bg-primary'
                        : k === calcul.i - 1
                          ? 'bg-primary/15'
                          : 'bg-muted',
                    )}
                  >
                    {k === calcul.i - 1 && (
                      <div
                        className="planning-calcul-temps absolute inset-y-0 left-0 rounded-full bg-primary/60"
                        style={{ width: `${part * 100}%` }}
                      />
                    )}
                  </div>
                ))}
              </div>

              <Button
                ref={bouton}
                type="button"
                variant="outline"
                className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/40"
                disabled={arret}
                onClick={arreter}
              >
                {arret ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Square className="size-3.5 fill-current" />
                )}
                {arret ? 'Arrêt en cours…' : 'Arrêter le calcul'}
              </Button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * Une semaine dessinée : 7 jours × matin, soir, nuit. Les points s'allument
 * de jour en jour et se relient (comme les points de transmission de la vue
 * mois), puis s'éteignent : une vague qui tourne tant que le calcul dure.
 * Immobile quand le système demande moins d'animation.
 */
function SemaineQuiSeTisse({ arret }: { arret: boolean }) {
  // Les moments du tableau de l'établissement (à l'hôtel : 3).
  const MOMENTS = momentsDuTableau(useMoments())
  const n = Math.max(1, MOMENTS.length)
  const x = (j: number) => 20 + j * 40
  const y = (m: number) => 14 + (m * 44) / Math.max(1, n - 1)
  return (
    <svg
      viewBox="0 0 280 86"
      className={cn(
        'planning-calcul-semaine h-auto w-full',
        arret && 'planning-calcul-semaine-arret',
      )}
      aria-hidden="true"
    >
      {JOURS.map((lettre, j) => (
        <g key={j} style={{ '--j': j } as CSSProperties}>
          {MOMENTS.slice(0, -1).map((_, m) => (
            <line
              key={m}
              className="planning-calcul-lien"
              x1={x(j)}
              x2={x(j)}
              y1={y(m) + 4}
              y2={y(m + 1) - 4}
              style={{ '--k': j * n + m } as CSSProperties}
            />
          ))}
          {MOMENTS.map((moment, m) => (
            <circle
              key={moment}
              className="planning-calcul-point"
              cx={x(j)}
              cy={y(m)}
              r={4}
              style={{ '--k': j * n + m } as CSSProperties}
            />
          ))}
          <text
            x={x(j)}
            y={82}
            textAnchor="middle"
            className="planning-calcul-jour"
          >
            {lettre}
          </text>
        </g>
      ))}
    </svg>
  )
}

/*
 * Panneau « Points d'attention », pour la semaine comme pour le mois
 * (refait le 2026-10-28, demande utilisateur : « confusant », puis « bien
 * plus court, beaucoup trop verbeux »). Une phrase de résumé, puis une ligne
 * repliée par famille avec son nombre (seules les infractions sont
 * ouvertes) ; dedans, un point par ligne. Jours passés ignorés. Le calcul
 * est dans `attention.ts`, le chiffre du bouton aussi. Lecture seule.
 */

import type { ReactNode } from 'react'
import { ChevronRight, CircleCheck } from 'lucide-react'

import {
  nombreInfractions,
  pointsAttention,
  resumePoints,
} from '#/components/planning/attention.ts'
import type { PointPersonne } from '#/components/planning/attention.ts'
import { ecartTexte } from '#/components/planning/semaine/Presence.tsx'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet.tsx'
import { numeroSemaine } from '#/lib/planning/affichage.ts'
import { libelleConsigne } from '#/lib/planning/presence.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { heureAffichee } from '#/lib/planning/temps.ts'
import type { Poste, Salarie } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

const JOUR = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const jourCourt = (date: string) => JOUR.format(new Date(`${date}T12:00:00Z`))
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export function CodeRegle({ regle }: { regle: string }) {
  if (!regle.startsWith('R-')) return null
  return (
    <span className="ml-1.5 rounded border px-1 py-px font-mono text-[10px] text-muted-foreground">
      {regle}
    </span>
  )
}

/** Une famille de points : une ligne repliée, son nombre, puis la liste. */
function Famille({
  titre,
  nombre,
  grave,
  children,
}: {
  titre: string
  nombre: number
  grave?: boolean
  children: ReactNode
}) {
  if (!nombre) return null
  return (
    <details open={grave} className="group rounded-lg border">
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden',
          grave && 'text-destructive',
        )}
      >
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        {titre}
        <span className="ml-auto rounded-full bg-muted px-2 text-xs text-muted-foreground tabular-nums">
          {nombre}
        </span>
      </summary>
      <ul className="flex flex-col border-t py-1 text-sm">{children}</ul>
    </details>
  )
}

const LIGNE = 'flex items-baseline gap-2 px-3 py-1'

function Personnes({ liste }: { liste: PointPersonne[] }) {
  return liste.flatMap((p) =>
    p.messages.map((m, i) => (
      <li key={`${p.id}-${i}`} className={LIGNE}>
        <strong className="shrink-0">{p.nom}</strong>
        <span className="min-w-0">{majuscule(m.texte)}</span>
        {m.semaine && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            S{numeroSemaine(m.semaine)}
          </span>
        )}
      </li>
    )),
  )
}

export function PanneauAlertes({
  ouvert,
  onFermer,
  semaines,
  salaries,
  postes,
  periode,
  garder,
  infractionsSeules = false,
}: {
  ouvert: boolean
  onFermer: () => void
  semaines: SemaineOut[]
  salaries: Salarie[]
  postes: Poste[]
  /** « Cette semaine », « En novembre »… */
  periode: string
  /** Jours retenus (`aVenir`, `aVenirDansLeMois`). */
  garder?: (date: string) => boolean
  /** Bouclier « règles HCR » : les seules infractions, passé compris. */
  infractionsSeules?: boolean
}) {
  const p = pointsAttention(semaines, salaries, postes, garder)
  const shifts = p.aPourvoir.flatMap((j) => j.shifts)
  const compte = (l: PointPersonne[]) =>
    l.reduce((n, x) => n + x.messages.length, 0)
  const nbInfractions = nombreInfractions(p)
  const autres = !infractionsSeules
  const ok = infractionsSeules ? nbInfractions === 0 : p.total === 0

  return (
    <Sheet open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>
            {infractionsSeules ? 'Règles HCR' : "Points d'attention"}
          </SheetTitle>
          <SheetDescription>
            {infractionsSeules ? periode : `${periode}, à partir d'aujourd'hui`}
          </SheetDescription>
          <p
            className={cn(
              'mt-1 flex items-center gap-2 text-sm font-medium',
              ok && 'text-emerald-600 dark:text-emerald-400',
            )}
          >
            {ok && <CircleCheck className="size-4" />}
            {infractionsSeules
              ? nbInfractions
                ? `${nbInfractions} infraction${nbInfractions > 1 ? 's' : ''} à corriger.`
                : 'Conforme aux règles HCR.'
              : resumePoints(p)}
          </p>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
          <Famille
            titre="Infractions à la loi"
            nombre={compte(p.infractions)}
            grave
          >
            <Personnes liste={p.infractions} />
          </Famille>

          <Famille
            titre="Shifts à pourvoir"
            nombre={autres ? shifts.length : 0}
          >
            {shifts.map((t) => (
              <li key={t.cle}>
                <details className="group/raison">
                  <summary
                    className={cn(
                      LIGNE,
                      'cursor-pointer list-none hover:bg-muted/50 [&::-webkit-details-marker]:hidden',
                    )}
                  >
                    <span className="w-24 shrink-0 text-muted-foreground">
                      {jourCourt(t.date)}
                    </span>
                    <span
                      className="size-2 shrink-0 self-center rounded-full"
                      style={{ background: t.poste?.couleur }}
                    />
                    <strong className="truncate">
                      {t.poste?.nom ?? 'Poste'}
                    </strong>
                    <span className="text-muted-foreground tabular-nums">
                      {heureAffichee(t.debut)}-{heureAffichee(t.fin)}
                    </span>
                    {t.manquant > 1 && (
                      <span className="text-xs font-semibold">
                        ×{t.manquant}
                      </span>
                    )}
                    <ChevronRight className="ml-auto size-3.5 shrink-0 self-center text-muted-foreground transition-transform group-open/raison:rotate-90" />
                  </summary>
                  <div className="flex flex-col gap-0.5 px-3 pb-1.5 pl-[7.25rem] text-xs text-muted-foreground">
                    {t.extras.length > 0 && (
                      <span>
                        <strong className="text-foreground">
                          Extras à appeler :
                        </strong>{' '}
                        {t.extras.join(', ')}
                      </span>
                    )}
                    {t.raisons.map((r) => (
                      <span key={r.message}>
                        {majuscule(r.message)} : {r.noms.join(', ')}
                      </span>
                    ))}
                    {!t.extras.length && !t.raisons.length && (
                      <span>Personne ne tient ce poste seul.</span>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </Famille>

          <Famille
            titre="Présence du matin et du soir"
            nombre={autres ? p.presence.length : 0}
          >
            {p.presence.map((e) => (
              <li key={e.cle} className={LIGNE}>
                <span className="w-24 shrink-0 text-muted-foreground">
                  {jourCourt(e.date)}
                </span>
                <span>
                  {majuscule(e.periode)} : {e.compte} pour{' '}
                  {libelleConsigne(e.minimum, e.maximum)}
                </span>
                <span
                  className={cn(
                    'ml-auto shrink-0 text-xs font-semibold',
                    e.ecart < 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-sky-600 dark:text-sky-400',
                  )}
                >
                  {ecartTexte(e.ecart)}
                </span>
              </li>
            ))}
          </Famille>

          <Famille titre="À vérifier" nombre={autres ? compte(p.aVerifier) : 0}>
            <Personnes liste={p.aVerifier} />
          </Famille>
        </div>
      </SheetContent>
    </Sheet>
  )
}

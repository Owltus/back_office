/*
 * Panneau « Points d'attention », pour la semaine comme pour le mois
 * (refait le 2026-10-28, demande utilisateur : « confusant et compliqué à
 * lire »). Une phrase de résumé, puis du plus grave au moins grave :
 * infractions, shifts à pourvoir par jour, présence, points à vérifier par
 * personne. Le calcul est dans `attention.ts` (le chiffre du bouton aussi).
 * Lecture seule.
 */

import type { ReactNode } from 'react'
import {
  ChevronRight,
  CircleCheck,
  CircleDashed,
  Info,
  Phone,
  ShieldAlert,
  Sun,
  Sunset,
} from 'lucide-react'

import {
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
import { libelleConsigne } from '#/lib/planning/presence.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { heureAffichee } from '#/lib/planning/temps.ts'
import type { Poste, Salarie } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

const JOUR = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})
const SEMAINE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const jourLong = (date: string) => {
  const t = JOUR.format(new Date(`${date}T12:00:00Z`))
  return t.charAt(0).toUpperCase() + t.slice(1)
}
const semaineDu = (lundi: string) =>
  `Semaine du ${SEMAINE.format(new Date(`${lundi}T12:00:00Z`))}`

export function CodeRegle({ regle }: { regle: string }) {
  if (!regle.startsWith('R-')) return null
  return (
    <span className="ml-1.5 rounded border px-1 py-px font-mono text-[10px] text-muted-foreground">
      {regle}
    </span>
  )
}

function Section({
  icone,
  titre,
  nombre,
  ton,
  children,
}: {
  icone: ReactNode
  titre: string
  nombre: number
  ton: 'rouge' | 'ambre' | 'neutre'
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3
        className={cn(
          'flex items-center gap-2 text-sm font-semibold',
          ton === 'rouge' && 'text-destructive',
          ton === 'ambre' && 'text-amber-600 dark:text-amber-400',
        )}
      >
        {icone}
        {titre}
        <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground tabular-nums">
          {nombre}
        </span>
      </h3>
      {children}
    </section>
  )
}

function Personnes({ liste }: { liste: PointPersonne[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {liste.map((p) => (
        <li
          key={p.id}
          className="rounded-lg border bg-muted/30 px-3 py-2 text-sm"
        >
          <strong>{p.nom}</strong>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {p.messages.map((m, i) => (
              <li key={i} className="text-sm">
                {m.semaine && (
                  <span className="text-muted-foreground">
                    {semaineDu(m.semaine)} :{' '}
                  </span>
                )}
                {m.texte.charAt(0).toUpperCase() + m.texte.slice(1)}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
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
}: {
  ouvert: boolean
  onFermer: () => void
  semaines: SemaineOut[]
  salaries: Salarie[]
  postes: Poste[]
  /** « cette semaine », « en novembre »… */
  periode: string
  /** Jours retenus (la vue mois : ceux du mois). */
  garder?: (date: string) => boolean
}) {
  const p = pointsAttention(semaines, salaries, postes, garder)
  const nbShifts = p.aPourvoir.reduce((n, j) => n + j.shifts.length, 0)

  return (
    <Sheet open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Points d'attention</SheetTitle>
          <SheetDescription>{periode}</SheetDescription>
          <p
            className={cn(
              'mt-1 flex items-center gap-2 text-sm font-medium',
              p.total === 0 && 'text-emerald-600 dark:text-emerald-400',
            )}
          >
            {p.total === 0 && <CircleCheck className="size-4" />}
            {resumePoints(p)}
          </p>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {p.infractions.length > 0 && (
            <Section
              icone={<ShieldAlert className="size-4" />}
              titre="Infractions à la loi"
              nombre={p.infractions.reduce((n, x) => n + x.messages.length, 0)}
              ton="rouge"
            >
              <Personnes liste={p.infractions} />
            </Section>
          )}

          {nbShifts > 0 && (
            <Section
              icone={<CircleDashed className="size-4" />}
              titre="Shifts à pourvoir"
              nombre={nbShifts}
              ton="ambre"
            >
              {p.aPourvoir.map((j) => (
                <div key={j.date} className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {jourLong(j.date)}
                  </span>
                  {j.shifts.map((t) => (
                    <details
                      key={t.cle}
                      className="group rounded-lg border bg-muted/30 text-sm"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: t.poste?.couleur }}
                        />
                        <strong className="truncate">
                          {t.poste?.nom ?? 'Poste'}
                        </strong>
                        <span className="text-muted-foreground tabular-nums">
                          {heureAffichee(t.debut)} → {heureAffichee(t.fin)}
                        </span>
                        {t.manquant > 1 && (
                          <span className="rounded-full bg-amber-500/15 px-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                            {t.manquant} personnes
                          </span>
                        )}
                        <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          Pourquoi
                          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                        </span>
                      </summary>
                      <div className="flex flex-col gap-1.5 border-t px-3 py-2 text-sm">
                        {t.extras.length > 0 && (
                          <p className="flex items-start gap-1.5">
                            <Phone className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            <span>
                              <strong>Extras à appeler :</strong>{' '}
                              {t.extras.join(', ')}
                            </span>
                          </p>
                        )}
                        {t.raisons.length === 0 && t.extras.length === 0 && (
                          <p className="text-muted-foreground">
                            Personne dans l'équipe ne tient ce poste seul.
                          </p>
                        )}
                        {t.raisons.map((r) => (
                          <p key={r.message}>
                            <span className="text-muted-foreground">
                              {r.message.charAt(0).toUpperCase() +
                                r.message.slice(1)}{' '}
                              :
                            </span>{' '}
                            {r.noms.join(', ')}
                          </p>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              ))}
            </Section>
          )}

          {p.presence.length > 0 && (
            <Section
              icone={<Sun className="size-4" />}
              titre="Présence du matin et du soir"
              nombre={p.presence.length}
              ton="ambre"
            >
              <ul className="flex flex-col gap-1.5 text-sm">
                {p.presence.map((e) => (
                  <li
                    key={e.cle}
                    className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2"
                  >
                    {e.periode === 'matin' ? (
                      <Sun className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <Sunset className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span>
                      {jourLong(e.date)}, {e.periode} : {e.compte} pour{' '}
                      {libelleConsigne(e.minimum, e.maximum)}
                    </span>
                    <span
                      className={cn(
                        'ml-auto shrink-0 rounded-full px-1.5 text-xs font-semibold',
                        e.ecart < 0
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
                      )}
                    >
                      {ecartTexte(e.ecart)}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {p.aVerifier.length > 0 && (
            <Section
              icone={<Info className="size-4" />}
              titre="À vérifier"
              nombre={p.aVerifier.reduce((n, x) => n + x.messages.length, 0)}
              ton="neutre"
            >
              <Personnes liste={p.aVerifier} />
            </Section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

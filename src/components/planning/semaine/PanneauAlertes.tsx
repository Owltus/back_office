/*
 * Panneau « Points d'attention » (prototype `PanneauAlertes.tsx`) : ce qui
 * manque (places à pourvoir, avec pour chacune pourquoi personne ne la prend)
 * et ce qui coince (alertes par personne). Lecture seule. Prend une ou
 * plusieurs semaines : la vue mois peut le reprendre tel quel.
 */

import { ChevronRight } from 'lucide-react'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet.tsx'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { ajouterJours, heureAffichee } from '#/lib/planning/temps.ts'
import type { Poste, Salarie } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

export const quand = (lundi: string, jour: number) =>
  FORMAT_JOUR.format(new Date(`${ajouterJours(lundi, jour)}T12:00:00Z`))

export function CodeRegle({ regle }: { regle: string }) {
  if (!regle.startsWith('R-')) return null
  return (
    <span className="ml-1.5 rounded border px-1 py-px font-mono text-[10px] text-muted-foreground">
      {regle}
    </span>
  )
}

export function PanneauAlertes({
  ouvert,
  onFermer,
  semaines,
  salaries,
  postes,
  periode,
}: {
  ouvert: boolean
  onFermer: () => void
  semaines: SemaineOut[]
  salaries: Salarie[]
  postes: Poste[]
  /** « cette semaine », « en novembre »… */
  periode: string
}) {
  const nom = (id: number) =>
    salaries.find((s) => s.id === id)?.prenom ?? 'Inconnu'
  const poste = (id: number) => postes.find((p) => p.id === id)
  const trous = semaines.flatMap((s) =>
    s.a_pourvoir.map((t) => ({ ...t, lundi: s.lundi })),
  )
  const plusieurs = semaines.length > 1
  const personnes = salaries
    .map((x) => ({
      id: x.id,
      alertes: semaines.flatMap((s) =>
        (s.bilan.find((b) => b.salarie_id === x.id)?.alertes ?? []).map(
          (a) => ({
            ...a,
            lundi: s.lundi,
          }),
        ),
      ),
    }))
    .filter((p) => p.alertes.length > 0)

  return (
    <Sheet open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Points d'attention</SheetTitle>
          <SheetDescription>
            Ce qui manque et ce qui coince {periode}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">
              Shifts à pourvoir ({trous.length})
            </h3>
            {trous.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Tous les besoins sont couverts.
              </p>
            )}
            {trous.map((t) => {
              const p = poste(t.poste_id)
              return (
                <details
                  key={`${t.lundi}-${t.besoin_id}`}
                  className="group rounded-lg border bg-muted/30 text-sm"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: p?.couleur }}
                    />
                    <strong className="truncate">{p?.nom ?? 'Poste'}</strong>
                    <span className="text-muted-foreground">
                      {quand(t.lundi, t.jour)} {heureAffichee(t.debut)}-
                      {heureAffichee(t.fin)}
                    </span>
                    {t.manquant > 1 && (
                      <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 text-xs font-semibold text-amber-500">
                        ×{t.manquant}
                      </span>
                    )}
                  </summary>
                  <div className="border-t px-3 py-2">
                    {t.raisons.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Personne dans l'équipe ne tient ce poste seul.
                      </p>
                    ) : (
                      <ul className="space-y-1 text-xs">
                        {t.raisons.map((r) => (
                          <li key={r.salarie_id}>
                            <strong>{nom(r.salarie_id)}</strong> :{' '}
                            {r.messages.length
                              ? r.messages.join(' ; ')
                              : 'disponible, au détriment de son volume horaire'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              )
            })}
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">
              Par personne ({personnes.length})
            </h3>
            {personnes.length === 0 && (
              <p className="text-sm text-muted-foreground">Rien à signaler.</p>
            )}
            {personnes.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border bg-muted/30 px-3 py-2 text-sm"
              >
                <strong>{nom(p.id)}</strong>
                <ul className="mt-1 space-y-1 text-xs">
                  {p.alertes.map((a, i) => (
                    <li
                      key={i}
                      className={cn(a.nature === 'loi' && 'text-destructive')}
                    >
                      {plusieurs && (
                        <span className="text-muted-foreground">
                          sem. du {quand(a.lundi, 0)} ·{' '}
                        </span>
                      )}
                      {a.message}
                      <CodeRegle regle={a.regle} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/*
 * Points d'attention du mois (prototype `PanneauAlertes.tsx`, en tiroir) :
 * les shifts à pourvoir et les alertes par personne, sur toutes les
 * semaines affichées. Lecture seule.
 */

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet.tsx'
import { SectionPresence } from '#/components/planning/semaine/Presence.tsx'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { ajouterJours, heureAffichee } from '#/lib/planning/temps.ts'
import type { Referentiel } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

const JOUR = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
export const quand = (lundi: string, jour: number) =>
  JOUR.format(new Date(`${ajouterJours(lundi, jour)}T12:00:00Z`))

export function PanneauAlertesMois({
  ouvert,
  onFermer,
  semaines,
  referentiel,
  periode,
}: {
  ouvert: boolean
  onFermer: () => void
  semaines: SemaineOut[]
  referentiel: Referentiel
  periode: string
}) {
  const nom = (id: number) =>
    referentiel.salaries.find((s) => s.id === id)?.prenom ?? '?'
  const poste = (id: number) => referentiel.postes.find((p) => p.id === id)
  const trous = semaines.flatMap((s) =>
    s.a_pourvoir.map((t) => ({ ...t, lundi: s.lundi })),
  )
  const plusieurs = semaines.length > 1
  const personnes = referentiel.salaries
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
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Points d'attention</SheetTitle>
          <SheetDescription>
            Ce qui manque et ce qui coince {periode}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-6">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              Shifts à pourvoir ({trous.length})
            </h3>
            {trous.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Tous les besoins sont couverts.
              </p>
            )}
            {trous.map((t) => (
              <details
                key={`${t.lundi}-${t.besoin_id}`}
                className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
              >
                <summary className="cursor-pointer">
                  <span
                    className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
                    style={{ background: poste(t.poste_id)?.couleur }}
                  />
                  <strong>{poste(t.poste_id)?.nom}</strong> ·{' '}
                  {quand(t.lundi, t.jour)} {heureAffichee(t.debut)}–
                  {heureAffichee(t.fin)}
                  {t.manquant > 1 && (
                    <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 text-xs text-amber-600 dark:text-amber-400">
                      ×{t.manquant}
                    </span>
                  )}
                </summary>
                {t.raisons.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Personne dans l'équipe ne tient ce poste seul.
                  </p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs">
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
              </details>
            ))}
          </section>
          <SectionPresence semaines={semaines} />
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              Par personne ({personnes.length})
            </h3>
            {personnes.length === 0 && (
              <p className="text-sm text-muted-foreground">Rien à signaler.</p>
            )}
            {personnes.map((p) => (
              <div
                key={p.id}
                className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
              >
                <strong>{nom(p.id)}</strong>
                <ul className="mt-1 flex flex-col gap-0.5 text-xs">
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
                      {a.message}{' '}
                      {a.regle.startsWith('R-') && (
                        <span className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                          {a.regle}
                        </span>
                      )}
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

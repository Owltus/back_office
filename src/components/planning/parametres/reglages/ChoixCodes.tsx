/*
 * Choix de codes horaires (poste, fiche d'une personne), rangés par famille
 * comme les menus du planning (décision utilisateur du 2026-10-28 : « que
 * tout soit bien attribué, bonne UI et bonne UX »). Un clic sur un code le
 * coche ou le décoche ; le bouton d'une famille la coche ou la décoche en
 * entier.
 */

import { Tip } from '#/components/shared/Tip.tsx'
import { grouperHoraires, texteSur } from '#/lib/planning/affichage.ts'
import { heureAffichee } from '#/lib/planning/temps.ts'
import type { Horaire } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

export function ChoixCodes({
  horaires,
  choisis,
  onChange,
  disabled,
  etiquette,
}: {
  /** Codes proposés (déjà réduits à ce qui a du sens). */
  horaires: Horaire[]
  choisis: number[]
  onChange: (choisis: number[]) => void
  disabled?: boolean
  etiquette: string
}) {
  const basculer = (ids: number[], cocher: boolean) =>
    onChange(
      cocher
        ? [...new Set([...choisis, ...ids])]
        : choisis.filter((id) => !ids.includes(id)),
    )
  return (
    <div role="group" aria-label={etiquette} className="flex flex-col gap-2.5">
      {grouperHoraires(horaires).map((g) => {
        const ids = g.horaires.map((h) => h.id)
        const toute = ids.every((id) => choisis.includes(id))
        return (
          <div key={g.libelle} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {g.libelle}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => basculer(ids, !toute)}
                className="text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {toute ? 'tout décocher' : 'tout cocher'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.horaires.map((h) => {
                const choisi = choisis.includes(h.id)
                return (
                  <Tip key={h.id} label={h.nom}>
                    <button
                      type="button"
                      aria-pressed={choisi}
                      aria-label={`${h.code} ${h.nom}`}
                      disabled={disabled}
                      onClick={() => basculer([h.id], !choisi)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed',
                        choisi
                          ? 'border-foreground/60 bg-accent text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <span
                        className="rounded px-1 text-[10px] font-semibold"
                        style={{
                          background: h.couleur,
                          color: texteSur(h.couleur),
                        }}
                      >
                        {h.code}
                      </span>
                      {heureAffichee(h.debut)}-{heureAffichee(h.fin)}
                    </button>
                  </Tip>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

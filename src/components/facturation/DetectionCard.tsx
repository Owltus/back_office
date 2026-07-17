import type { Detection } from '#/lib/facturation/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Carte « imputation probable » — le POURCENTAGE de validation (confiance) en
 * clair + barre, et les MOTS qui ont voté (explicabilité des nuages). Trois états :
 * abstention (preuve mince), rien détecté, ou une proba avec ses mots. L'imputation
 * elle-même est déjà pré-sélectionnée dans la liste ; la carte dit à quel point s'y fier.
 */

/** Palette selon le niveau de confiance (texte + barre). */
function confidenceTone(confidence: number): { text: string; bar: string } {
  if (confidence >= 0.6)
    return { text: 'text-emerald-500', bar: 'bg-emerald-500' }
  if (confidence >= 0.35) return { text: 'text-amber-500', bar: 'bg-amber-500' }
  return { text: 'text-muted-foreground', bar: 'bg-muted-foreground' }
}

export function DetectionCard({ detection }: { detection: Detection | null }) {
  const d = detection

  if (d?.abstained) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
        Preuve insuffisante — à choisir manuellement.
      </div>
    )
  }

  if (!d || !d.code) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
        Aucune imputation détectée — à choisir manuellement.
      </div>
    )
  }

  const pct = Math.round(d.confidence * 100)
  const tone = confidenceTone(d.confidence)
  const words = d.scores?.[0]?.words ?? []

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Imputation probable
        </span>
        <span className={cn('text-sm font-semibold tabular-nums', tone.text)}>
          {pct} %
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn('h-full rounded-full transition-all', tone.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {words.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-muted-foreground">via</span>
          {words.map((w) => (
            <span
              key={w}
              className="rounded bg-secondary/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
            >
              {w}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

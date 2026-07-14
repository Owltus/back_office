import { cn } from '#/lib/utils.ts'

/*
 * Mini-graphique en ligne (sparkline) — SVG inline, sans dépendance. Épuré,
 * comme la maquette /artefact : UNE seule ligne, rien d'autre (pas d'aire, pas
 * de point, pas de texte). Étiré en largeur (`preserveAspectRatio="none"`) ; le
 * trait reste net grâce à `vector-effect: non-scaling-stroke`. Rien sous 2 points.
 */
export function Sparkline({
  data,
  color = '#34d399',
  className,
}: {
  data: number[]
  /** Couleur de la ligne. */
  color?: string
  className?: string
}) {
  if (data.length < 2) return null

  const W = 100
  const H = 22
  const PAD = 2
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const x = (i: number) => (i / (data.length - 1)) * W
  const y = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2)

  const line = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn('block h-[22px] w-full', className)}
      style={{ color }}
      aria-hidden="true"
    >
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

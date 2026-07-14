import { cn } from '#/lib/utils.ts'

/*
 * Mini-graphique en ligne (sparkline) — SVG inline, sans dépendance. Léger :
 * une aire translucide + la ligne + un point sur la dernière valeur. Étiré en
 * largeur (`preserveAspectRatio="none"`) mais le trait reste net grâce à
 * `vector-effect: non-scaling-stroke`. Rien à afficher sous 2 points.
 */
export function Sparkline({
  data,
  color = '#34d399',
  className,
}: {
  data: number[]
  /** Couleur de la ligne / de l'aire. */
  color?: string
  className?: string
}) {
  if (data.length < 2) return null

  const W = 100
  const H = 28
  const PAD = 3
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const x = (i: number) => (i / (data.length - 1)) * W
  const y = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2)

  const points = data.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`)
  const line = points.join(' ')
  const area = `${x(0).toFixed(2)},${H} ${line} ${x(data.length - 1).toFixed(2)},${H}`
  const lastX = x(data.length - 1)
  const lastY = y(data[data.length - 1])

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn('block h-7 w-full', className)}
      style={{ color }}
      aria-hidden="true"
    >
      <polygon points={area} fill="currentColor" fillOpacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r={2}
        fill="currentColor"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

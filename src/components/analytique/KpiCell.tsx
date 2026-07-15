import { cn } from '#/lib/utils.ts'

/*
 * Cellule de valeur KPI des tableaux analytique, avec la mécanique responsive
 * « double affichage » : version longue (avec unité) au-dessus de `sm`, version
 * compacte sans unité en dessous. Une valeur nulle/absente rend un tiret grisé.
 * L'appelant fournit les deux formateurs et un `className` d'accent (opacité
 * « futur », rouge sur-capacité…).
 */
export function KpiCell({
  value,
  full,
  compact,
  className,
}: {
  value: number | null | undefined
  full: (n: number) => string
  compact: (n: number) => string
  className?: string
}) {
  return (
    <td
      className={cn(
        'whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums',
        className,
      )}
    >
      {value != null ? (
        <>
          <span className="hidden sm:inline">{full(value)}</span>
          <span className="sm:hidden">{compact(value)}</span>
        </>
      ) : (
        <span className="text-muted-foreground/50">—</span>
      )}
    </td>
  )
}

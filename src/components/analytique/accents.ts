/*
 * Palette d'accents des pages analytique — SOURCE UNIQUE, theme-aware (tokens
 * shadcn `--chart-*` / `--muted-foreground`). Toutes les cartes (liseré `accent`) et
 * les valeurs colorées (colonnes, segments de graphe) des 5 features y puisent, au
 * lieu de hex en dur dispersés (`#818cf8`, `#38bdf8`, `#34d399`, `#fbbf24`…).
 *
 * But : un SYSTÈME cohérent — un même SUJET porte la même couleur d'une page à
 * l'autre (occupation, captage, volume…), sans jamais deux cartes de la même
 * couleur sur une même page. La valeur en tableau reprend l'accent de sa carte.
 *
 * Sémantique (à respecter d'une page à l'autre) :
 *   indigo → volume principal (nuitées, réservations, arrivées, vendues, servis, carte…)
 *   cyan   → taux d'occupation / remplissage
 *   pink   → captage / conversion (part captée) — DISTINCT du cyan pour cohabiter
 *            avec l'occupation sur une même page (parking).
 *   green  → argent / revenu / encaissé / nettoyées
 *   amber  → à surveiller (écarts, refus, non servis, CA)
 *   slate  → neutre / moyenne / référence / base (inclus)
 *   red    → négatif fort (impayés, bloquées) — seule couleur hors token (pas
 *            d'équivalent `--chart-*`), miroir de `.rapro-room-todo` (rapro.css).
 */
export const ACCENT = {
  indigo: 'var(--chart-1)',
  cyan: 'var(--chart-2)',
  amber: 'var(--chart-3)',
  pink: 'var(--chart-4)',
  green: 'var(--chart-5)',
  slate: 'var(--muted-foreground)',
  red: '#f87171',
} as const

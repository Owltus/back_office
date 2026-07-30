/*
 * Palette d'accents des pages analytique — SOURCE UNIQUE, theme-aware (tokens
 * shadcn `--chart-*` / `--muted-foreground`). Toutes les cartes (liseré `accent`) et
 * les valeurs colorées (colonnes, segments de graphe) des 5 features y puisent, au
 * lieu de hex en dur dispersés (`#818cf8`, `#38bdf8`, `#34d399`, `#fbbf24`…).
 *
 * But : un SYSTÈME de couleurs cohérent, pas des assignations identiques — chaque
 * page reste libre d'affecter la couleur qui convient à sa métrique.
 *
 * Usage courant (indicatif, non contraignant) :
 *   indigo → volume principal (nuitées, réservations, vendues, servis, carte…)
 *   cyan   → taux / occupation / conversion / part
 *   green  → argent / revenu / encaissé / nettoyées
 *   amber  → à surveiller (écarts, refus, non servis, CA)
 *   pink   → métrique secondaire (remplissage)
 *   slate  → neutre / moyenne / référence
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

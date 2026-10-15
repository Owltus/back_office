// Règles métier de `montre-resume`, PURES et sans import : c'est ce qui permet
// à `src/lib/montre/miroir.sync.test.ts` (vitest) de les comparer aux sources
// de l'application. Toute divergence avec l'écran fait échouer ce test.
//
// Sources reproduites :
//   - ALL_ROOMS            : src/lib/hotel/rooms.ts
//   - stayKind             : src/lib/pdj/csv.ts
//   - compteurs PDJ        : BreakfastBoard.tsx (`stats`, boucle sur ALL_ROOMS)
//   - barre de progression : SummaryCards.tsx (precedent / caJour / projete)

const plage = (debut: number, fin: number) =>
  Array.from({ length: fin - debut + 1 }, (_, i) => debut + i)

/** Les 80 chambres de l'hôtel (miroir de src/lib/hotel/rooms.ts). */
export const ALL_ROOMS: number[] = [
  ...plage(102, 114),
  ...plage(201, 214),
  ...plage(301, 314),
  ...plage(401, 414),
  ...plage(501, 514),
  ...plage(621, 631),
]

/** Nature du séjour d'après le statut PMS (miroir de src/lib/pdj/csv.ts). */
export function stayKind(status: string): 'staying' | 'departing' | null {
  if (status.includes('IN HOUSE')) return 'staying'
  if (status.includes('DUE OUT') || status.includes('CHECKED OUT'))
    return 'departing'
  return null
}

export interface LignePdj {
  room: number
  status: string | null
  breakfasts_included: number | null
}

export interface ComptesPdj {
  disponible: boolean
  restent: number
  departs: number
  inclus: number
}

/** Compteurs de la page PDJ, chambre par chambre sur ALL_ROOMS. */
export function comptesPdj(lignes: LignePdj[]): ComptesPdj {
  const parChambre = new Map<number, LignePdj>()
  for (const l of lignes) parChambre.set(l.room, l)
  let restent = 0
  let departs = 0
  let inclus = 0
  for (const room of ALL_ROOMS) {
    const l = parChambre.get(room)
    if (!l) continue
    inclus += l.breakfasts_included ?? 0
    const kind = stayKind(l.status ?? '')
    if (kind === 'staying') restent++
    else if (kind === 'departing') departs++
  }
  return { disponible: lignes.length > 0, restent, departs, inclus }
}

export interface EntreeRep {
  /** Rapport du jour (J-1), ou null s'il n'est pas arrivé. */
  rapport: {
    rj_to: number
    rj_room_revenue: number
    rmtd_room_revenue: number
    pm_room_revenue: number
  } | null
  /** Cumul du dernier rapport du mois (mode partiel seulement). */
  dernierCumulDuMois: number | null
  /** Σ forecast_days.rev_ttc du mois, ou null si aucune prévision. */
  forecastMois: number | null
  /** budget.room_revenue du mois, ou null si aucune ligne. */
  budgetMois: number | null
}

export interface ResumeRep {
  partiel: boolean
  pct_precedent: number | null
  pct_veille: number | null
  pct_projete: number | null
  to: number | null
}

/** Une décimale : la montre n'en affiche pas plus, et la réponse reste courte. */
const arrondi = (n: number) => Math.round(n * 10) / 10

/**
 * Barre de progression de REP jour, en % du budget du mois, SANS l'échelle
 * ×1,15 (la montre l'applique). Même calcul que SummaryCards.tsx :
 *   acquis    = rmtd_room_revenue (cumul, jour compris)
 *   caJour    = rj_room_revenue (0 en partiel)
 *   precedent = max(0, acquis − caJour)
 *   projete   = max(0, projeté fin de mois − acquis)
 * Mode partiel (rapport absent, DashboardBoard.tsx) : acquis = cumul du dernier
 * rapport du mois, projeté = Σ du Forecast du mois, caJour = 0.
 */
export function resumeRep(e: EntreeRep): ResumeRep {
  const partiel = e.rapport === null
  const acquis = e.rapport
    ? e.rapport.rmtd_room_revenue
    : (e.dernierCumulDuMois ?? 0)
  const caJour = e.rapport ? e.rapport.rj_room_revenue : 0
  const projeteMois = e.rapport ? e.rapport.pm_room_revenue : (e.forecastMois ?? 0)
  const precedent = Math.max(0, acquis - caJour)
  const projete = Math.max(0, projeteMois - acquis)
  const budget = e.budgetMois
  const pct =
    budget != null && budget > 0
      ? (v: number) => arrondi((v / budget) * 100)
      : () => null
  return {
    partiel,
    pct_precedent: pct(precedent),
    pct_veille: partiel ? null : pct(caJour),
    pct_projete: pct(projete),
    to: e.rapport ? arrondi(e.rapport.rj_to) : null,
  }
}

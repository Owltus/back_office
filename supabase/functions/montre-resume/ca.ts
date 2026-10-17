// Chiffre d'affaires du petit-déjeuner, COPIE EXACTE des sources de l'app
// (Deno ne peut pas importer `src/`, alias `#/`). PUR et sans import.
// `src/lib/montre/miroir.sync.test.ts` compare chaque fonction à l'originale
// sur des milliers de cas générés : s'il casse, reporter la modification de
// l'autre côté, ne jamais ajuster le test.
//
// Sources :
//   - isStaffRow, offertUnits, breakfastCode, computePdjCA : src/lib/pdj/breakdown.ts
//   - billedRevenueTtc, cardPrices (+ modeDeLaFenetre)    : src/lib/pdj/pricing.ts
//   - detectUnitPrice, detectTarifs                        : src/lib/pdj/tarif.ts
//   - fromTTC (÷ 1,10)                                     : src/lib/repjour/constants.ts

const VAT_FACTOR = 1 + 10 / 100
const fromTTC = (ttc: number) => ttc / VAT_FACTOR
const round2 = (n: number) => Math.round(n * 100) / 100

export interface LigneCa {
  addons: string | null
  breakfasts_included: number
  breakfasts_served: number
  manual_kind?: string | null
  rate_plan?: string | null
  breakfasts_offert?: number
}

export function isStaffRow(ratePlan: string | null | undefined): boolean {
  return (ratePlan ?? '').toUpperCase().includes('STAFF')
}

function offertUnits(r: LigneCa): number {
  if (isStaffRow(r.rate_plan)) return r.breakfasts_served
  const extra = Math.max(0, r.breakfasts_served - r.breakfasts_included)
  if (r.manual_kind === 'offert') return extra
  return Math.min(r.breakfasts_offert ?? 0, extra)
}

export function breakfastCode(addons: string | null): string | null {
  const a = (addons ?? '').toUpperCase()
  if (!a.includes('PDJ')) return null
  if (a.includes('PDJGROUP')) return 'PDJGROUP10'
  if (a.includes('PDJBB')) return 'PDJBB'
  return 'PDJ'
}

/** computePdjCA, réduit à son total HT (seul champ servi à la montre). */
export function caTotalHt(
  rows: LigneCa[],
  tarifs: Map<string, number>,
  externalsCount = 0,
  billedTtc?: number | null,
): number {
  const unitHt = (code: string): number => {
    const p = tarifs.get(code)
    return p != null ? round2(fromTTC(p)) : 0
  }
  let topTtc = 0
  for (const p of tarifs.values()) if (p > topTtc) topTtc = p
  const extraUnitHt = topTtc > 0 ? round2(fromTTC(topTtc)) : 0

  let extraNb = Math.max(0, externalsCount)
  let offertNb = 0
  let rebuiltHt = 0
  for (const r of rows) {
    let code = breakfastCode(r.addons)
    if (!code && r.manual_kind === 'inclus') code = 'PDJ'
    const staff = isStaffRow(r.rate_plan)
    if (staff) code = null
    if (code && r.breakfasts_included > 0) {
      rebuiltHt += round2(r.breakfasts_included * unitHt(code))
    }
    const included = staff ? 0 : r.breakfasts_included
    extraNb += Math.max(0, r.breakfasts_served - included)
    offertNb += offertUnits(r)
  }
  rebuiltHt = round2(rebuiltHt)
  const billedKnown = billedTtc != null && billedTtc > 0
  const includedHt = billedKnown ? round2(fromTTC(billedTtc)) : rebuiltHt
  const extrasHt = round2(Math.max(0, extraNb - offertNb) * extraUnitHt)
  return round2(includedHt + extrasHt)
}

export function billedRevenueTtc(addon: { revenue_ttc: number }[]): number {
  let total = 0
  for (const row of addon) total += row.revenue_ttc
  return round2(total)
}

export interface LigneAgg {
  service_date: string
  code: string | null
  included: number
  revenue_ttc: number | null
}

const CARD_WINDOW = 21
const CARD_MIN_OBSERVATIONS = 3

interface Observation {
  date: string
  cents: number
}

function modeDeLaFenetre(obs: Observation[], fin = obs.length): number {
  const debut = Math.max(0, fin - CARD_WINDOW)
  const taille = fin - debut
  if (taille < CARD_MIN_OBSERVATIONS) return 0
  const count = new Map<number, number>()
  for (let i = debut; i < fin; i++) {
    count.set(obs[i].cents, (count.get(obs[i].cents) ?? 0) + 1)
  }
  let best = 0
  let bestN = 0
  let bestRank = -1
  for (const [cents, n] of count) {
    let rank = -1
    for (let i = fin - 1; i >= debut; i--) {
      if (obs[i].cents === cents) {
        rank = i
        break
      }
    }
    if (n > bestN || (n === bestN && rank > bestRank)) {
      best = cents
      bestN = n
      bestRank = rank
    }
  }
  return best
}

export function cardPrices(
  rows: LigneAgg[],
  fallback: Map<string, number> = new Map(),
  asOf?: string,
): Map<string, number> {
  const byCode = new Map<string, Observation[]>()
  for (const r of rows) {
    if (!r.code || r.included <= 0) continue
    if (r.revenue_ttc == null || r.revenue_ttc <= 0) continue
    if (asOf != null && r.service_date > asOf) continue
    const cents = Math.round((r.revenue_ttc / r.included) * 100)
    if (cents <= 0) continue
    const list = byCode.get(r.code)
    if (list) list.push({ date: r.service_date, cents })
    else byCode.set(r.code, [{ date: r.service_date, cents }])
  }
  const prices = new Map<string, number>()
  for (const [code, obs] of byCode) {
    obs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const cents = modeDeLaFenetre(obs)
    if (cents > 0) prices.set(code, cents / 100)
  }
  for (const [code, price] of fallback) {
    if (!prices.has(code) && price > 0) prices.set(code, price)
  }
  return prices
}

const SUPPORT_MIN = 0.5
const SUPPORT_TOLERANCE = 0.95

export function detectUnitPrice(revenues: number[]): number | null {
  const cents = revenues.map((r) => Math.round(r * 100)).filter((c) => c > 0)
  if (cents.length < 3) return null
  const candidates = new Set<number>()
  for (const c of cents) {
    for (let k = 1; k <= 60; k++) {
      const cand = Math.round(c / k)
      if (cand >= 100 && cand <= 5000) candidates.add(cand)
    }
  }
  let maxMult = 0
  const multOf = new Map<number, number>()
  for (const cand of candidates) {
    let m = 0
    for (const c of cents) if (c % cand === 0) m++
    multOf.set(cand, m)
    if (m > maxMult) maxMult = m
  }
  if (maxMult / cents.length < SUPPORT_MIN) return null
  const supportFloor = maxMult * SUPPORT_TOLERANCE
  let best = 0
  for (const [cand, m] of multOf) if (m >= supportFloor && cand > best) best = cand
  return best > 0 ? best / 100 : null
}

export function detectTarifs(
  addon: { code: string; revenue_ttc: number }[],
): Map<string, number> {
  const byCode = new Map<string, number[]>()
  for (const a of addon) {
    const list = byCode.get(a.code) ?? []
    list.push(a.revenue_ttc)
    byCode.set(a.code, list)
  }
  const tarifs = new Map<string, number>()
  for (const [code, revs] of byCode) {
    const p = detectUnitPrice(revs)
    if (p != null) tarifs.set(code, p)
  }
  return tarifs
}

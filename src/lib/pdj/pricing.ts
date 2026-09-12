import { breakfastCode } from '#/lib/pdj/breakdown.ts'

/* --------------------------------------------------------------------------
 * Prix RÉELS du petit-déjeuner, lus dans la facturation du PMS.
 *
 * Jusqu'au 2026-09-12, le prix était DEVINÉ : on cherchait le plus grand montant
 * dont la quasi-totalité des recettes étaient des multiples (`tarif.ts`). Une
 * remise de 8 € un seul jour a suffi à faire tomber le tarif PDJ de 19 € à 1 €
 * et à diviser par dix-neuf tout le chiffre d'affaires affiché.
 *
 * Or le PMS transmet chaque jour ce qu'il a facturé, par code
 * (`pdj_addon_production.revenue_ttc`), et l'analyse de neuf mois d'historique
 * a montré que ce revenu correspond EXACTEMENT aux petits-déjeuners INCLUS
 * (corrélation 0,994 ; écart cumulé 0,1 %). Le prix d'un couvert se lit donc
 * directement : revenu du code ÷ inclus du code, sur la journée elle-même.
 *
 * Ce que ce revenu NE contient PAS, vérifié sur les mêmes neuf mois :
 *   - les EXTRAS servis au-delà de l'inclus (75 couverts en neuf mois) ;
 *   - les EXTERNES, clients non logés saisis à la main dans l'application ;
 *   - les OFFERTS, qui sont des extras et n'ont jamais été facturés.
 * Ces trois-là restent donc valorisés à part, au PRIX FORT du jour (décision du
 * 2026-09-12 : un extra se vend au tarif plein, jamais au tarif groupe).
 *
 * L'intérêt de lire le prix plutôt que de le deviner : il suit de lui-même les
 * changements de tarif décidés par la direction, les remises, et les codes à
 * prix distincts — sans qu'aucune heuristique n'ait à s'en apercevoir.
 * ------------------------------------------------------------------------ */

/** Ligne de facturation du jour, telle que le PMS l'envoie. */
export interface AddonDayRow {
  code: string
  revenue_ttc: number
}

/** Ligne de chambre, réduite à ce dont le prix a besoin. */
interface IncludedRow {
  addons: string | null
  breakfasts_included: number
  manual_kind?: string | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Petits-déjeuners INCLUS par code, tels que l'application les connaît — le
 *  dénominateur du prix réel. Miroir de `breakfastCode` (un inclus manuel, sans
 *  code dans `addons`, compte comme un PDJ). */
export function includedByCode(rows: IncludedRow[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    let code = breakfastCode(r.addons)
    if (!code && r.manual_kind === 'inclus') code = 'PDJ'
    if (!code || r.breakfasts_included <= 0) continue
    out.set(code, (out.get(code) ?? 0) + r.breakfasts_included)
  }
  return out
}

/**
 * Prix unitaire TTC de chaque code POUR CE JOUR : ce que le PMS a facturé,
 * divisé par les couverts inclus correspondants.
 *
 * `fallback` (les tarifs déduits de l'historique, cf. `detectTarifs`) prend le
 * relais pour un code dont le prix n'est pas calculable ce jour-là : aucune
 * recette, aucun inclus, ou une recette négative (avoir, extourne — huit jours
 * en neuf mois, tous sur le code groupe). On préfère alors un prix de référence
 * plausible à un prix absurde.
 */
export function dayUnitPrices(
  addon: AddonDayRow[],
  included: Map<string, number>,
  fallback: Map<string, number>,
): Map<string, number> {
  const prices = new Map<string, number>()
  for (const row of addon) {
    const inc = included.get(row.code) ?? 0
    if (inc > 0 && row.revenue_ttc > 0) {
      prices.set(row.code, round2(row.revenue_ttc / inc))
    }
  }
  // Les codes sans prix calculable héritent du prix de référence.
  for (const [code, price] of fallback) {
    if (!prices.has(code) && price > 0) prices.set(code, price)
  }
  return prices
}

/**
 * Prix FORT : le plus élevé de TOUS les prix connus, sur autant de cartes que
 * l'appelant en fournit.
 *
 * Décision du 2026-09-12 : un extra, un externe ou un couvert offert se
 * valorise au tarif plein — le petit-déjeuner vendu au comptoir n'est pas le
 * petit-déjeuner d'un forfait groupe. En pratique 19 € (PDJ) contre 10 €
 * (PDJBB, PDJGROUP10).
 *
 * Pourquoi PLUSIEURS cartes : le prix moyen du jour peut être tiré vers le bas
 * par une remise accordée à une réservation (le 2026-09-12, le code PDJ tombe
 * à 18,50 € parce qu'une chambre a été remisée de 8 €). Cette remise n'est pas
 * la carte des tarifs : un client qui descend prendre un petit-déjeuner paie
 * toujours 19 €. On passe donc aussi les prix de RÉFÉRENCE, et on retient le
 * maximum — « le prix le plus élevé qu'on puisse mettre au petit-déjeuner ».
 * Une hausse décidée par la direction est visible dès le premier jour (elle est
 * dans le prix du jour) ; une baisse durable descend la référence au fil de
 * l'historique (cf. `detectTarifs`).
 *
 * `null` si aucun prix n'est connu, auquel cas l'appelant n'a rien à valoriser.
 */
export function topPrice(...priceMaps: Map<string, number>[]): number | null {
  let best = 0
  for (const prices of priceMaps) {
    for (const p of prices.values()) if (p > best) best = p
  }
  return best > 0 ? best : null
}

/** Recette TTC facturée par le PMS ce jour-là, tous codes confondus.
 *
 *  Inclut le GROUPE POSTÉ EN BLOC — une recette rattachée à aucune chambre
 *  (un seul jour en neuf mois, 690 €). Décision du 2026-09-12 : le chiffre
 *  d'affaires doit refléter ce que l'hôtel a facturé, l'écart avec la somme des
 *  chambres étant signalé à part plutôt que passé sous silence. */
export function billedRevenueTtc(addon: AddonDayRow[]): number {
  let total = 0
  for (const row of addon) total += row.revenue_ttc
  return round2(total)
}

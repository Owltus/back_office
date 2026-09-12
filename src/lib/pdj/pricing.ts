/* --------------------------------------------------------------------------
 * Petit-déjeuner (PDJ) — ce que le PMS a réellement facturé.
 *
 * Deux choses DISTINCTES, qu'il ne faut jamais confondre (c'est l'erreur
 * corrigée le 2026-09-12, après coup) :
 *
 *   1. Le PRIX D'UN COUVERT — celui de la carte. Il vaut 19,00 € TTC pour PDJ,
 *      10,00 € pour PDJBB et PDJGROUP10 (mesuré sur 602 recettes réelles). Il
 *      n'est écrit nulle part en dur : `detectTarifs` (tarif.ts) le retrouve
 *      dans l'historique de facturation, et suit donc un changement de tarif
 *      décidé par la direction.
 *
 *   2. La RECETTE D'UNE JOURNÉE — ce que l'hôtel a encaissé ce jour-là, remises,
 *      gestes commerciaux et groupes facturés en bloc compris. Elle est LUE
 *      (`pdj_addon_production.revenue_ttc`), jamais reconstituée.
 *
 * Diviser la seconde par les couverts ne redonne PAS la première : c'est une
 * MOYENNE. Mesuré sur la production, ce quotient va de 8,14 € à 28,50 € pour le
 * code PDJ, et jusqu'à 96,25 € pour le code groupe — parce qu'une remise le tire
 * vers le bas et qu'une facturation en bloc (recette sans les chambres qui la
 * portent) le tire vers le haut. L'afficher chambre par chambre revenait à
 * montrer 16,82 € HT là où le client a payé 17,27 €. On ne s'en sert donc pas.
 *
 * Règle retenue : le PRIX affiché est celui de la carte ; le TOTAL de la
 * journée est la recette facturée. L'écart entre les deux (ce que les chambres
 * n'expliquent pas) est signalé, pas dissous dans un prix moyen.
 * ------------------------------------------------------------------------ */

/** Ligne de facturation du jour, telle que le PMS l'envoie. */
export interface AddonDayRow {
  code: string
  revenue_ttc: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Prix FORT de la carte : le plus élevé des prix connus.
 *
 * Décision du 2026-09-12 : un extra, un externe ou un couvert offert se
 * valorise au tarif plein — le petit-déjeuner vendu au comptoir n'est pas le
 * petit-déjeuner d'un forfait groupe. En pratique 19 € (PDJ) contre 10 €
 * (PDJBB, PDJGROUP10). Une remise accordée à une réservation ne le brade pas
 * davantage : ce prix vient de la carte, pas de la recette d'un jour.
 *
 * `null` si aucun prix n'est connu, auquel cas l'appelant n'a rien à valoriser.
 */
export function topPrice(prices: Map<string, number>): number | null {
  let best = 0
  for (const p of prices.values()) if (p > best) best = p
  return best > 0 ? best : null
}

/** Recette TTC facturée par le PMS ce jour-là, tous codes confondus.
 *
 *  Inclut le GROUPE POSTÉ EN BLOC — une recette rattachée à aucune chambre.
 *  Décision du 2026-09-12 : le chiffre d'affaires doit refléter ce que l'hôtel a
 *  facturé, l'écart avec la somme des chambres étant signalé à part plutôt que
 *  passé sous silence. Un avoir (recette négative) la diminue, comme il se doit. */
export function billedRevenueTtc(addon: AddonDayRow[]): number {
  let total = 0
  for (const row of addon) total += row.revenue_ttc
  return round2(total)
}

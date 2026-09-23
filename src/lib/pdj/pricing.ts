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

/** Ligne de l'agrégat journalier : ce qu'une journée a facturé, et sur combien
 *  de couverts inclus. Le strict nécessaire pour relire la carte des tarifs. */
export interface DailyCodeRow {
  service_date: string
  code: string | null
  included: number
  revenue_ttc: number | null
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

/**
 * Nombre d'observations retenues pour lire la carte. Vingt-et-un jours : assez
 * pour qu'une poignée de journées atypiques (remise, geste commercial, groupe
 * facturé en bloc) reste minoritaire, assez peu pour qu'un changement de tarif
 * l'emporte en une dizaine de jours.
 */
const CARD_WINDOW = 21

/** En deçà, la fenêtre ne dit rien de fiable : on garde le prix de repli. */
const CARD_MIN_OBSERVATIONS = 3

/**
 * Carte des tarifs, relue dans la facturation : pour chaque code, le prix
 * unitaire TTC le plus FRÉQUENT parmi les vingt-et-une dernières journées
 * exploitables (recette ÷ couverts inclus). Mesuré sur la production le
 * 2026-09-12 : PDJ 19,00 €, PDJBB 10,00 €, PDJGROUP10 10,00 €.
 *
 * POURQUOI LE MODE, ET NON LA MOYENNE. Le quotient d'UNE journée n'est pas un
 * prix : une remise le tire vers le bas, un groupe facturé en bloc vers le haut
 * (de 8,14 € à 96,25 € selon les jours). Mais il vaut EXACTEMENT le prix de la
 * carte la plupart du temps — 203 jours sur 254 pour le code PDJ. La valeur la
 * plus fréquente est donc le prix, et les journées atypiques n'y pèsent rien.
 *
 * POURQUOI PAS LA RECHERCHE DE DIVISEUR (`detectTarifs`, tarif.ts), qui tenait
 * ce rôle jusqu'ici. Elle cherche le plus grand montant dont la majorité des
 * recettes sont des multiples. Tant qu'un seul prix existe, elle le trouve.
 * Mais elle ne survit pas à un CHANGEMENT de tarif : simulé sur l'historique
 * réel, un passage de 19 € à 25 € la fait tomber à 1,00 € dès le seizième jour
 * (19 et 25 n'ont pour diviseur commun que 1), et elle y reste. Ce n'est pas un
 * retard, c'est un chiffre absurde — celui qui avait divisé tout le chiffre
 * d'affaires par dix-neuf le 2026-09-12. Le mode, lui, bascule proprement sur
 * 25 € au huitième jour. `detectTarifs` ne sert donc plus que de REPLI, pour un
 * code que la fenêtre ne renseigne pas encore.
 *
 * Le TOTAL d'une journée, lui, ne dépend d'aucune de ces deux méthodes : il vaut
 * la recette facturée. Un changement de tarif y entre dès le premier jour. Seuls
 * le prix affiché par chambre et la valorisation des extras suivent la carte.
 */
/** Une observation exploitable : le quotient d'une journée, en centimes. */
interface Observation {
  date: string
  cents: number
}

/**
 * Prix retenu pour une liste d'observations TRIÉE par date croissante : le mode
 * des `CARD_WINDOW` dernières, `0` si elles sont trop peu nombreuses.
 *
 * Extrait de `cardPrices` le 2026-09-23 pour être partagé avec
 * `cardPricesByDate` — le mode et son départage des ex aequo ne doivent exister
 * qu'à UN endroit. Toute divergence entre les deux se traduirait par un écart
 * de montant entre le board et l'analytique, ce que ce chantier corrige
 * précisément.
 *
 * `fin` permet de ne considérer que le début de la liste (exclu), pour une
 * fenêtre glissante sans recopie de tableau.
 */
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
    // Dernière position de ce prix dans la fenêtre : départage les ex aequo en
    // faveur du plus RÉCENT, pour ne pas rester sur l'ancien tarif le jour où
    // le nouveau l'égale.
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

/**
 * Le prix de la carte TEL QU'IL ÉTAIT chaque jour, pour un ensemble de dates.
 *
 * POURQUOI — décision utilisateur du 2026-09-23. Le board PDJ valorisait déjà
 * chaque jour au tarif qui avait cours ce jour-là (il passe `asOf`), mais les
 * deux pages analytiques appliquaient UN SEUL prix — celui d'aujourd'hui — à
 * tout l'historique. Sur une période traversant un changement de tarif, board
 * et analytique n'affichaient donc pas les mêmes montants. Citation de la
 * décision : « si un jour le prix du petit déj est à celui-ci, le jour qui suit
 * c'en est un autre […] tu dois afficher les bons prix au bon moment de manière
 * cohérente ».
 *
 * COMMENT — une seule passe glissante, et non 365 appels à `cardPrices`. Les
 * observations sont triées une fois par code ; les dates cibles sont parcourues
 * dans l'ordre croissant en avançant un curseur. Le résultat est IDENTIQUE à
 * `cardPrices(rows, fallback, date)` appelée pour chaque date — c'est ce que
 * vérifie `pricing.test.ts`.
 *
 * Le repli `fallback` s'applique par date, comme dans `cardPrices` : un code
 * que la fenêtre ne renseigne pas ce jour-là garde son prix de repli.
 */
export function cardPricesByDate(
  rows: DailyCodeRow[],
  dates: Iterable<string>,
  fallback: Map<string, number> = new Map(),
): Map<string, Map<string, number>> {
  // Mêmes filtres d'exploitabilité que `cardPrices`, à la lettre.
  const byCode = new Map<string, Observation[]>()
  for (const r of rows) {
    if (!r.code || r.included <= 0) continue
    if (r.revenue_ttc == null || r.revenue_ttc <= 0) continue
    const cents = Math.round((r.revenue_ttc / r.included) * 100)
    if (cents <= 0) continue
    const list = byCode.get(r.code)
    if (list) list.push({ date: r.service_date, cents })
    else byCode.set(r.code, [{ date: r.service_date, cents }])
  }
  for (const obs of byCode.values()) {
    obs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  }

  const triees = [...new Set(dates)].sort()
  const parDate = new Map<string, Map<string, number>>()
  // Un curseur par code, qui n'avance jamais en arrière : c'est ce qui rend la
  // passe linéaire au lieu de quadratique.
  const curseurs = new Map<string, number>()

  for (const date of triees) {
    const prix = new Map<string, number>()
    for (const [code, obs] of byCode) {
      let i = curseurs.get(code) ?? 0
      while (i < obs.length && obs[i].date <= date) i++
      curseurs.set(code, i)
      const cents = modeDeLaFenetre(obs, i)
      if (cents > 0) prix.set(code, cents / 100)
    }
    for (const [code, p] of fallback) {
      if (!prix.has(code) && p > 0) prix.set(code, p)
    }
    parDate.set(date, prix)
  }
  return parDate
}

export function cardPrices(
  rows: DailyCodeRow[],
  /** Prix de repli par code (`detectTarifs`), pour un code trop peu observé. */
  fallback: Map<string, number> = new Map(),
  /** Ne lire que les journées jusqu'à cette date incluse — pour valoriser un
   *  jour passé au tarif qui avait cours À CE MOMENT-LÀ, et non aujourd'hui. */
  asOf?: string,
): Map<string, number> {
  // Quotients exploitables, en CENTIMES (entiers : deux prix égaux doivent
  // l'être au sens strict, ce que les flottants ne garantissent pas).
  const byCode = new Map<string, { date: string; cents: number }[]>()
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

  // Un code que la fenêtre ne renseigne pas garde son prix de repli.
  for (const [code, price] of fallback) {
    if (!prices.has(code) && price > 0) prices.set(code, price)
  }
  return prices
}

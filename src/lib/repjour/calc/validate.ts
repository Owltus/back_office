import { TOTAL_ROOMS } from '#/lib/repjour/constants.ts'
import type {
  Alert,
  DailyReport,
  ForecastRow,
  KPIBlock,
} from '#/lib/repjour/types.ts'

/**
 * Référence HT servant d'étalon pour juger si un forecast est bien en HT.
 * `adrHT` = prix moyen chambre RÉALISÉ MTD (en HT, non manipulable).
 * `throughDay` = dernier jour du mois couvert par ce réalisé : la comparaison se
 * fait À PÉRIMÈTRE ÉGAL (forecast restreint aux jours ≤ throughDay), pour ne pas
 * confondre un décalage de TVA avec une simple saisonnalité de fin de mois.
 */
export interface TvaRef {
  adrHT: number
  throughDay: number
}

/** Jours réalisés minimum pour qu'un ADR MTD fasse foi (l'ADR d'un seul jour est
 * trop volatil pour servir de référence). */
const SEUIL_JOURS_REF = 5

/**
 * Construit la référence HT à partir du RÉALISÉ MTD (revenu chambre HT / nuitées
 * cumulés jusqu'au jour `throughDay`), si assez de jours sont réalisés. Réalisé
 * SEUL (pas de repli budget : trop bruité). `null` = pas de référence fiable (mois
 * futur, début de mois) → aucune détection TVA possible.
 */
export function buildTvaRefFrom(
  roomRevenueHT: number,
  nuitees: number,
  throughDay: number,
): TvaRef | null {
  if (nuitees >= SEUIL_JOURS_REF && roomRevenueHT > 0 && throughDay > 0) {
    return { adrHT: roomRevenueHT / nuitees, throughDay }
  }
  return null
}

export function buildTvaRef(latestReport: DailyReport | null): TvaRef | null {
  if (!latestReport) return null
  return buildTvaRefFrom(
    latestReport.rmtd_room_revenue,
    latestReport.rmtd_nuitees,
    latestReport.day_of_month,
  )
}

/*
 * Messages de validation — VOLONTAIREMENT sans chiffres et CONSTANTS (identiques
 * d'un mois à l'autre) : `preValidateForecast` les dédoublonne, si bien qu'un même
 * souci sur plusieurs mois ne donne QU'UN message. Phrases simples, tutoiement, on
 * dit juste ce qui cloche et quoi faire. Source UNIQUE : les messages de
 * `validateForecast` (prévisions) ET de `validateCoherence` (rapport réel) sont ici.
 */
const MSG = {
  empty:
    'Ce fichier ne contient aucun jour. Vérifie le mois que tu as exporté.',
  incomplete:
    "Il manque des jours dans le fichier. Réexporte le mois entier (normal si le mois n'est pas encore fini).",
  impossible:
    'Le fichier contient des chiffres impossibles. Il a mal été exporté, recommence.',
  occNoRev:
    'Sur certains jours, des chambres sont occupées mais leur montant est à zéro. Vérifie le fichier.',
  adrWeird:
    "Le prix moyen par chambre est anormal. Vérifie que c'est le bon fichier.",
  tvaIncluse:
    "Ce forecast est en TTC (montants trop hauts d'environ 10 %). Réexporte-le en décochant Include Tax.",
  // Cohérence du rapport réel (réalisé) — étaient écrits en dur dans validateCoherence.
  realNegatives:
    'Le fichier contient des chiffres négatifs. Il a mal été exporté, recommence.',
  tooManyRooms:
    "Le fichier compte plus de chambres vendues que l'hôtel n'en a. Vérifie le fichier.",
  roomNoRevenue:
    'Des chambres sont vendues mais leur montant est à zéro. Vérifie le fichier.',
  revenueNoRoom:
    'Il y a un montant mais aucune chambre vendue. Vérifie le fichier.',
} as const

/**
 * Valide les données forecast d'UN mois avant import. Retourne des alertes
 * (error = bloquant, warning = informatif), au plus UNE par souci et sans chiffre.
 */
export function validateForecast(
  rows: ForecastRow[],
  daysInMonth: number,
  ref: TvaRef | null,
): Alert[] {
  const alerts: Alert[] = []

  if (rows.length === 0) {
    alerts.push({ type: 'error', message: MSG.empty })
    return alerts
  }

  // Jours manquants
  if (rows.length < daysInMonth) {
    alerts.push({ type: 'warning', message: MSG.incomplete })
  }

  // UNE seule alerte si au moins une ligne est impossible (valeur négative, ou
  // revenu sans occupation) — pas une par jour. Occ > TOTAL_ROOMS = overbooking,
  // valide, pas d'alerte.
  const hasImpossible = rows.some(
    (r) => r.occ < 0 || r.revHT < 0 || (r.occ === 0 && r.revHT > 0),
  )
  if (hasImpossible) {
    alerts.push({ type: 'error', message: MSG.impossible })
  }

  // Occupation SANS revenu : souvent une colonne REV vide (parseFloat -> 0), qui
  // fausse le projeté ; parfois du comp légitime. Avertissement forçable, pas une
  // erreur bloquante — pour ne pas refuser un vrai cas comp.
  const hasOccNoRev = rows.some((r) => r.occ > 0 && r.revHT === 0)
  if (hasOccNoRev) {
    alerts.push({ type: 'warning', message: MSG.occNoRev })
  }

  // ADR moyen sur le mois
  const totalOcc = rows.reduce((s, r) => s + r.occ, 0)
  const totalRev = rows.reduce((s, r) => s + r.revHT, 0)
  const avgADR = totalOcc > 0 ? totalRev / totalOcc : 0

  if (avgADR > 0 && (avgADR < 30 || avgADR > 300)) {
    alerts.push({ type: 'warning', message: MSG.adrWeird })
  }

  // Détection « forecast en TTC » (case « Include Tax » restée cochée à l'export ;
  // tout est en HT depuis le 2026-10-31). Le forecast n'a AUCUNE colonne de
  // taxe : on ne peut pas l'auto-vérifier, on le compare donc à une référence HT
  // FIABLE — l'ADR réalisé du mois (`ref`, jamais le budget ni l'import
  // précédent). Sans référence (mois futur), on ne juge pas.
  //
  // À PÉRIMÈTRE ÉGAL : on ne compare que les jours DÉJÀ RÉALISÉS (≤ throughDay), où
  // le forecast doit coller au réalisé. Sinon la saisonnalité de fin de mois
  // (projetée moins chère) ferait chuter la moyenne du mois entier et refuserait à
  // tort un fichier correct. Un forecast en TTC est ~10 à 16 % au-dessus du
  // réalisé : bande TOLÉRANTE, l'inverse exact de l'ancienne 0,83–0,93 (quand
  // le réalisé était TTC et qu'on chassait un forecast HT), soit 1/0,93 à
  // 1/0,83. Au-delà, ce n'est plus une simple TVA en trop (laissé à adrWeird).
  // C'est une DONNÉE FAUSSE → ERROR BLOQUANTE (fichier refusé, à réexporter).
  if (ref && ref.adrHT > 0) {
    let occPast = 0
    let revPast = 0
    for (const r of rows) {
      const day = parseInt(r.date.slice(8, 10), 10)
      if (day <= ref.throughDay) {
        occPast += r.occ
        revPast += r.revHT
      }
    }
    const adrPast = occPast > 0 ? revPast / occPast : 0
    if (adrPast > 0) {
      const ratio = adrPast / ref.adrHT
      if (ratio > 1 / 0.93 && ratio < 1 / 0.83) {
        alerts.push({ type: 'error', message: MSG.tvaIncluse })
      }
    }
  }

  return alerts
}

export function validateCoherence(realiseJour: KPIBlock): Alert[] {
  const alerts: Alert[] = []

  // Impossibilités PHYSIQUES (certaines) → bloquantes. Le snapshot de nuit ne peut
  // ni dépasser l'inventaire (80 chambres) ni être négatif. Le taux d'occupation se
  // déduit des nuitées : pas de contrôle séparé (ce serait le même fait).
  if (realiseJour.nuitees < 0 || realiseJour.roomRevenue < 0) {
    alerts.push({ type: 'error', message: MSG.realNegatives })
  }
  if (realiseJour.nuitees > TOTAL_ROOMS) {
    alerts.push({ type: 'error', message: MSG.tooManyRooms })
  }

  // Incohérences PROBABLES, avec de rares cas limites room-only légitimes (day-use,
  // no-show, comp) → à vérifier, non bloquantes.
  if (realiseJour.nuitees > 0 && realiseJour.roomRevenue === 0) {
    alerts.push({ type: 'warning', message: MSG.roomNoRevenue })
  }
  if (realiseJour.nuitees === 0 && realiseJour.roomRevenue > 0) {
    alerts.push({ type: 'warning', message: MSG.revenueNoRoom })
  }

  return alerts
}

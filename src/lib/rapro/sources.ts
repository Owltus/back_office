/*
 * Sources de données du Rapprochement — métier pur (sans React ni Supabase).
 *
 * La page se nourrit d'exports du PMS importés ailleurs dans l'app. Quand l'un
 * manque, l'écran doit nommer LE FICHIER et L'ONGLET où l'importer, pas se
 * contenter d'une grille vide. On distingue :
 *
 *   - « In-House Guests » : INDISPENSABLE. Il porte l'occupation chambre par
 *     chambre, d'où dérivent les vendues, le grisé, la balance et le roulement.
 *     Sans lui il n'y a littéralement rien à afficher.
 *   - « Comparison By Date » : FACULTATIF. Il n'alimente que l'alerte d'écart
 *     d'occupation. Son absence dégrade, elle ne bloque pas.
 *
 * « Forecast By Date Range » n'apparaît pas ici : le rapprochement ne le lit
 * jamais (il ne sert qu'au projeté mensuel de RepJour).
 */

/** Un export PMS attendu, et ce que son absence coûte. */
export interface MissingSource {
  /** Nom de l'export tel que le PMS le produit (préfixe du fichier CSV). */
  file: string
  /** Onglet de l'app où on l'importe. */
  tab: string
  /** Le jour concerné ('YYYY-MM-DD') — pas le même pour les deux fichiers. */
  date: string
  /** Sans lui, la page ne peut rien afficher. */
  required: boolean
  /** Ce qui reste indisponible tant qu'il manque. */
  impact: string
}

export interface SourceState {
  /** L'occupation du jour (In-House) est chargée et non vide. */
  hasOccupancy: boolean
  /** Le Comparison de la veille est importé (occupation officielle connue). */
  hasOfficialOcc: boolean
  /** Jour affiché ('YYYY-MM-DD'). */
  date: string
  /** Veille du jour affiché : le Comparison porte les données de J-1. */
  previousDate: string
}

/**
 * Les exports manquants, le bloquant d'abord. Liste vide = tout est là (auquel
 * cas l'écran n'affiche rien : on ne signale que les anomalies).
 */
export function missingSources(state: SourceState): MissingSource[] {
  const missing: MissingSource[] = []

  if (!state.hasOccupancy) {
    missing.push({
      file: 'In-House Guests',
      tab: 'PDJ',
      date: state.date,
      required: true,
      impact: 'les chambres vendues et leur suivi ménage',
    })
  }

  if (!state.hasOfficialOcc) {
    missing.push({
      file: 'Comparison By Date',
      tab: 'RepJour',
      date: state.previousDate,
      required: false,
      impact: "le contrôle d'occupation",
    })
  }

  return missing
}

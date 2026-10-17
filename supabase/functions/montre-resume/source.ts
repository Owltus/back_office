// Lectures de `montre-resume`, avec la clé serveur (comme import-report). Les
// colonnes sont EXPLICITES : jamais `select *`, jamais `guest_name` ni aucune
// autre donnée nominative. Toute erreur de lecture LÈVE : le gestionnaire la
// rend en 503 (panne), jamais en « rien à afficher ».

import type { LigneParking, LignePdj } from './regles.ts'

/** Ce que le gestionnaire lit ; injecté pour les tests. */
export interface Source {
  rapport(date: string): Promise<{
    rj_to: number
    rj_nuitees: number
    rj_room_revenue: number
    rmtd_room_revenue: number
    pm_room_revenue: number
  } | null>
  /** pm_room_revenue du dernier rapport ANTÉRIEUR à `date` dans le même mois. */
  pmPrecedent(
    date: string,
    annee: number,
    mois: number,
  ): Promise<number | null>
  dernierCumulDuMois(annee: number, mois: number): Promise<number | null>
  forecastMois(annee: number, mois: number): Promise<number | null>
  budgetMois(annee: number, mois: number): Promise<number | null>
  pdj(date: string): Promise<LignePdj[]>
  /** Réservations commencées entre `depuis` et `jour` inclus (toutes pages). */
  parking(depuis: string, jour: string): Promise<LigneParking[]>
}

/** Colonnes lues, figées ici et vérifiées par les tests. */
export const COLONNES = {
  rapport:
    'rj_to,rj_nuitees,rj_room_revenue,rmtd_room_revenue,pm_room_revenue',
  precedent: 'pm_room_revenue',
  cumul: 'rmtd_room_revenue',
  forecast: 'rev_ttc',
  budget: 'room_revenue',
  pdj: 'room,status,breakfasts_included',
  // Jamais `client` ni `comment` : seulement ce qui décide d'une place prise.
  parking: 'spot,start_date,nights',
} as const

/** Page de lecture : au-delà de 1000 lignes, l'API tronque sans le dire. */
export const PAGE_PARKING = 1000

type Reponse = { data: unknown; error: { message: string } | null }

/** Sous-ensemble du client supabase-js réellement utilisé. */
// deno-lint-ignore no-explicit-any
export type ClientLecture = { from(table: string): any }

function donnees<T>(r: Reponse, quoi: string): T {
  if (r.error) throw new Error(`${quoi} : ${r.error.message}`)
  return r.data as T
}

export function sourceSupabase(client: ClientLecture): Source {
  return {
    async rapport(date) {
      const r = await client
        .from('daily_reports')
        .select(COLONNES.rapport)
        .eq('date', date)
        .maybeSingle()
      return donnees(r, 'daily_reports')
    },
    async pmPrecedent(date, annee, mois) {
      // Même lecture que 'rapportPrecedent' de repjour_dashboard : même mois,
      // date strictement antérieure, la plus récente.
      const r = await client
        .from('daily_reports')
        .select(COLONNES.precedent)
        .eq('year', annee)
        .eq('month', mois)
        .lt('date', date)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      const l = donnees<{ pm_room_revenue: number } | null>(r, 'daily_reports')
      return l ? l.pm_room_revenue : null
    },
    async dernierCumulDuMois(annee, mois) {
      const r = await client
        .from('daily_reports')
        .select(COLONNES.cumul)
        .eq('year', annee)
        .eq('month', mois)
        .order('day_of_month', { ascending: false })
        .limit(1)
        .maybeSingle()
      const l = donnees<{ rmtd_room_revenue: number } | null>(r, 'daily_reports')
      return l ? l.rmtd_room_revenue : null
    },
    async forecastMois(annee, mois) {
      const r = await client
        .from('forecast_days')
        .select(COLONNES.forecast)
        .eq('year', annee)
        .eq('month', mois)
      const l = donnees<{ rev_ttc: number | null }[]>(r, 'forecast_days')
      // Même règle que repjour_dashboard : null si AUCUNE prévision du mois.
      return l.length === 0 ? null : l.reduce((s, x) => s + (x.rev_ttc ?? 0), 0)
    },
    async budgetMois(annee, mois) {
      const r = await client
        .from('budget')
        .select(COLONNES.budget)
        .eq('year', annee)
        .eq('month', mois)
        .maybeSingle()
      const l = donnees<{ room_revenue: number } | null>(r, 'budget')
      return l ? l.room_revenue : null
    },
    async pdj(date) {
      const r = await client
        .from('pdj_breakfasts')
        .select(COLONNES.pdj)
        .eq('service_date', date)
      return donnees<LignePdj[]>(r, 'pdj_breakfasts')
    },
    async parking(depuis, jour) {
      // Comme fetchReservations (src/lib/parking/service.ts) : ordre stable par
      // id, page par page jusqu'à une page incomplète.
      const toutes: LigneParking[] = []
      for (let debut = 0; ; debut += PAGE_PARKING) {
        const r = await client
          .from('parking_reservations')
          .select(COLONNES.parking)
          .gte('start_date', depuis)
          .lte('start_date', jour)
          .order('id', { ascending: true })
          .range(debut, debut + PAGE_PARKING - 1)
        const page = donnees<LigneParking[]>(r, 'parking_reservations')
        toutes.push(...page)
        if (page.length < PAGE_PARKING) return toutes
      }
    },
  }
}

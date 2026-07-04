import { Store } from '@tanstack/store'

/* Store module-level : les données du petit-déjeuner survivent à la navigation
 * (le composant peut se démonter/remonter sans perdre le CSV chargé).
 * En mémoire uniquement — réinitialisé à un rechargement complet de la page. */

export interface Guest {
  room: number
  status: string
  guestName: string
  vip: boolean
  guests: number // adultes + enfants (bébés exclus côté PMS)
  breakfastsIncluded: number
  stayCount: number
}

export type GuestMap = Record<number, Guest>

export interface PdjState {
  guests: GuestMap | null
  fileName: string
  // Timestamp (ms) plutôt qu'un objet Date : sérialisable et stable.
  dateMs: number | null
}

export const pdjStore = new Store<PdjState>({
  guests: null,
  fileName: '',
  dateMs: null,
})

export function setPdjData(guests: GuestMap, fileName: string, dateMs: number | null) {
  pdjStore.setState((s) => ({ ...s, guests, fileName, dateMs }))
}

export function resetPdjData() {
  pdjStore.setState((s) => ({ ...s, guests: null, fileName: '', dateMs: null }))
}

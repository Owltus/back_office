import type { Reservation } from '#/lib/parking/model.ts'

// Données locales de test (v1, sans Supabase) — utilisées tant que la feature
// n'est pas branchée sur une vraie source de données.
export const INITIAL: Reservation[] = [
  { id: 'r1', client: 'Dupont', spot: 1, startDay: 0, nights: 2, status: 'confirme', comment: 'Arrivée tardive prévue, vers 20h.' },
  { id: 'r2', client: 'Martin', spot: 3, startDay: 1, nights: 1, status: 'attente', comment: '' },
  { id: 'r3', client: 'Bernard', spot: 5, startDay: 2, nights: 3, status: 'confirme', comment: '' },
  { id: 'r4', client: 'Leroy', spot: 8, startDay: 4, nights: 2, status: 'attente', comment: '' },
  { id: 'r5', client: 'Durand', spot: 13, startDay: 0, nights: 1, status: 'annule', comment: '' },
]

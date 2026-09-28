import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PdjAddonRow, PdjDayRow } from '#/lib/pdj/service.ts'

/*
 * Accès Supabase du petit-déjeuner contre un client SIMULÉ (la base n'est
 * jamais touchée). Comme PostgREST, le simulateur ne rend les lignes touchées
 * d'une écriture QUE si la requête les demande (`.select`) : un refus RLS se
 * lit alors 0 ligne, sans erreur.
 */

const sim = vi.hoisted(() => ({
  lignes: 0,
  selects: [] as string[],
  /** Relecture après un retrait à 0 ligne : la saisie existe-t-elle encore ? */
  presente: true,
  relectureErreur: null as { message: string } | null,
}))

vi.mock('#/lib/supabase.ts', () => {
  const from = () => {
    let select: string | null = null
    let unique = false
    const q = {
      maybeSingle() {
        unique = true
        return q
      },
      update: () => q,
      delete: () => q,
      eq: () => q,
      lt: () => q,
      not: () => q,
      order: () => q,
      range: () => q,
      select(cols: string) {
        select = cols
        sim.selects.push(cols)
        return q
      },
      then(resolve: (r: { data: unknown; error: unknown }) => void) {
        if (unique) {
          resolve({
            data: sim.presente ? { id: 'x' } : null,
            error: sim.relectureErreur,
          })
          return
        }
        const data =
          select === null
            ? null
            : Array.from({ length: sim.lignes }, (_, i) => ({ id: `p${i}` }))
        resolve({ data, error: null })
      },
    }
    return q
  }
  return { supabase: { from } }
})

const {
  PDJ_ADDON_COLUMNS,
  PDJ_DAY_COLUMNS,
  SaisieNonRetireeError,
  fetchAddonProduction,
  fetchDay,
  purgeOldGuestNames,
  setManualServe,
} = await import('#/lib/pdj/service.ts')

beforeEach(() => {
  sim.lignes = 1
  sim.selects = []
  sim.presente = true
  sim.relectureErreur = null
})

describe('setManualServe — retrait d’une saisie manuelle', () => {
  it('une ligne supprimée : succès', async () => {
    await expect(
      setManualServe('2026-09-28', 101, 0, 'inclus'),
    ).resolves.toBeUndefined()
  })

  it('0 ligne et saisie encore là (refus RLS silencieux) : refus typé', async () => {
    sim.lignes = 0
    sim.presente = true
    await expect(
      setManualServe('2026-09-28', 101, 0, 'inclus'),
    ).rejects.toBeInstanceOf(SaisieNonRetireeError)
  })

  it('0 ligne et saisie absente (déjà retirée ailleurs) : succès', async () => {
    sim.lignes = 0
    sim.presente = false
    await expect(
      setManualServe('2026-09-28', 101, 0, 'inclus'),
    ).resolves.toBeUndefined()
  })

  it('0 ligne et relecture en échec : erreur non typée « refus »', async () => {
    sim.lignes = 0
    sim.relectureErreur = { message: 'réseau' }
    const err: unknown = await setManualServe(
      '2026-09-28',
      101,
      0,
      'inclus',
    ).catch((e: unknown) => e)
    expect(err).toEqual({ message: 'réseau' })
    expect(err).not.toBeInstanceOf(SaisieNonRetireeError)
  })
})

describe('purgeOldGuestNames', () => {
  it('rend le nombre de lignes anonymisées', async () => {
    sim.lignes = 12
    await expect(purgeOldGuestNames('2026-09-27')).resolves.toBe(12)
  })

  it('0 ligne : aucune erreur (rien à purger ou droit absent)', async () => {
    sim.lignes = 0
    await expect(purgeOldGuestNames('2026-09-27')).resolves.toBe(0)
  })
})

/** Ligne complète : TypeScript refuse ici toute clé manquante OU en trop, donc
 *  toute dérive entre le type et la liste des colonnes fait échouer tsc ou le
 *  test ci-dessous. */
const LIGNE_JOUR: Required<PdjDayRow> = {
  id: '',
  service_date: '',
  room: 0,
  guest_name: null,
  status: '',
  vip: false,
  adults: 0,
  children: 0,
  guests: 0,
  no_of_nights: null,
  room_type: null,
  rate_plan: null,
  channel: null,
  company: null,
  guarantee: null,
  payment_type: null,
  addons: null,
  adr: null,
  arrival_date: null,
  departure_date: null,
  stay_count: 0,
  breakfasts_included: 0,
  source_file: '',
  manual_kind: null,
  breakfasts_served: 0,
  served: false,
  breakfasts_offert: 0,
}

const LIGNE_ADDON: Required<PdjAddonRow> = {
  id: '',
  service_date: '',
  code: '',
  total_count: 0,
  revenue_ttc: 0,
  source_file: null,
}

const colonnes = (s: string) =>
  s
    .split(',')
    .map((c) => c.trim())
    .sort()

describe('colonnes explicites (plus de select *)', () => {
  it('fetchDay lit exactement les colonnes de PdjDayRow', async () => {
    await fetchDay('2026-09-28')
    expect(sim.selects).toEqual([PDJ_DAY_COLUMNS])
    expect(colonnes(PDJ_DAY_COLUMNS)).toEqual(Object.keys(LIGNE_JOUR).sort())
  })

  it('fetchAddonProduction lit exactement les colonnes de PdjAddonRow', async () => {
    await fetchAddonProduction('2026-09-28')
    expect(sim.selects).toEqual([PDJ_ADDON_COLUMNS])
    expect(colonnes(PDJ_ADDON_COLUMNS)).toEqual(Object.keys(LIGNE_ADDON).sort())
  })
})

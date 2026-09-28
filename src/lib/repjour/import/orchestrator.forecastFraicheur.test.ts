import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * L'import de secours (navigateur) doit rendre le Forecast « frais » comme
 * l'Edge Function : `forecast_days.imported_at` est réécrit à CHAQUE import.
 * Le DEFAULT now() de la colonne ne joue qu'à l'insertion : un upsert sur des
 * dates déjà présentes gardait l'ancien horodatage, et l'envoi automatique
 * comme le bandeau PMS jugeaient le Forecast périmé.
 *
 * Les parseurs sont remplacés par des valeurs figées : seul compte ici ce qui
 * part vers `forecast_days`.
 */

const upserts: { table: string; rows: Record<string, unknown>[] }[] = []

/** Faux client : toute chaîne de lecture se résout, `single()` rend le budget. */
function chaine(table: string) {
  const c: Record<string, unknown> = {}
  const self = () => c
  c.select = self
  c.eq = self
  c.single = () =>
    Promise.resolve({
      data: { year: 2026, month: 9, budget_ca: 1, budget_nuitees: 1 },
      error: null,
    })
  c.upsert = (rows: Record<string, unknown> | Record<string, unknown>[]) => {
    upserts.push({ table, rows: Array.isArray(rows) ? rows : [rows] })
    return Promise.resolve({ error: null })
  }
  return c
}

vi.mock('#/lib/supabase.ts', () => ({
  supabase: { from: (table: string) => chaine(table) },
}))

const ligne = (jour: number) => ({
  date: `2026-09-${String(jour).padStart(2, '0')}`,
  month: 9,
  year: 2026,
  occ: 60,
  revHT: 6000,
  revTTC: 6600,
})

vi.mock('#/lib/repjour/parse/forecast.ts', () => ({
  parseForecast: () => [ligne(27), ligne(28)],
  parseForecastAll: () => [ligne(27), ligne(28)],
}))
vi.mock('#/lib/repjour/parse/detect.ts', () => ({
  detectFileType: (name: string) =>
    name.includes('comparison') ? 'comparison' : 'forecast',
}))
vi.mock('#/lib/repjour/parse/date.ts', () => ({
  extractReportDate: () => ({
    dayOfMonth: 27,
    month: 9,
    year: 2026,
    daysInMonth: 30,
  }),
}))
vi.mock('#/lib/repjour/parse/comparison.ts', () => ({
  parseComparison: () => ({
    today: {
      occupiedRoomsExclComp: 60,
      totalRevenueHT: 6000,
      totalRevenueTTC: 6600,
      vat: 600,
    },
    mtd: {
      occupiedRoomsExclComp: 1600,
      totalRevenueHT: 160000,
      totalRevenueTTC: 176000,
    },
  }),
}))
vi.mock('#/lib/repjour/parse/metrics.ts', () => ({
  parseComparisonMetrics: () => [],
}))
vi.mock('#/lib/repjour/services/metrics.ts', () => ({
  upsertDailyMetrics: () => Promise.resolve(),
}))
vi.mock('#/lib/repjour/calc/validate.ts', () => ({
  buildTvaRef: () => null,
  buildTvaRefFrom: () => null,
  validateCoherence: () => [],
  validateForecast: () => [],
}))

const { importForecastDays, processImport } =
  await import('#/lib/repjour/import/orchestrator.ts')

const fichier = (nom: string) => new File(['x'], nom, { type: 'text/csv' })

function horodatagesForecast(): unknown[] {
  return upserts
    .filter((u) => u.table === 'forecast_days')
    .flatMap((u) => u.rows.map((r) => r.imported_at))
}

beforeEach(() => {
  upserts.length = 0
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-28T01:15:00Z'))
})

describe('import de secours du Forecast — fraîcheur', () => {
  it('import Forecast seul : imported_at = maintenant, sur chaque ligne', async () => {
    await importForecastDays(fichier('forecast.csv'))
    expect(horodatagesForecast()).toEqual([
      '2026-09-28T01:15:00.000Z',
      '2026-09-28T01:15:00.000Z',
    ])
  })

  it('import des deux fichiers : imported_at = maintenant, sur chaque ligne', async () => {
    await processImport(
      fichier('comparison.csv'),
      fichier('forecast.csv'),
      'user-1',
    )
    expect(horodatagesForecast()).toEqual([
      '2026-09-28T01:15:00.000Z',
      '2026-09-28T01:15:00.000Z',
    ])
  })
})

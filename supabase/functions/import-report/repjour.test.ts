// Lancer : `deno test --no-check --node-modules-dir=none supabase/functions/import-report/repjour.test.ts`
// (`--no-check` : la vérification de types exige les paquets npm de
// supabase-js, absents du poste ; le test n'en a pas besoin à l'exécution.)
//
// Un Comparison rejeté (422) est PERDU : le PMS ne le renvoie pas. Le budget du
// mois n'est ni écrit ni utilisé par l'import ; seul l'envoi automatique en a
// besoin, et il le contrôle lui-même (autoSend.ts). L'import ne doit donc pas
// l'exiger.

import { assertEquals } from 'jsr:@std/assert@1'
import { importComparison } from './repjour.ts'

const CSV = `SECTION,TODAY,MTD,LAST YEAR MTD,REPORT DATE
 Occupied Rooms,60.00,1600.00,1500.00,27-09-2026
ROOM REVENUE,6000.00,160000.00,150000.00,27-09-2026
VAT,600.00,16000.00,15000.00,27-09-2026
`

/** Faux client : aucun budget en base, deux jours de Forecast. */
function adminSansBudget() {
  const tables: string[] = []
  const ecritures: string[] = []
  const reponse = (table: string) =>
    table === 'budget'
      ? { data: null, error: { message: 'JSON object requested, 0 rows' } }
      : table === 'forecast_days'
        ? { data: [{ occ: 60, rev_ttc: 6600 }, { occ: 60, rev_ttc: 6600 }], error: null }
        : { data: null, error: null }
  const admin = {
    from(table: string) {
      tables.push(table)
      const r = reponse(table)
      const c: Record<string, unknown> = {
        select: () => c,
        eq: () => c,
        gt: () => c,
        single: () => Promise.resolve(r),
        maybeSingle: () => Promise.resolve(r),
        then: (ok: (v: unknown) => unknown) => Promise.resolve(r).then(ok),
        upsert: () => {
          ecritures.push(table)
          return Promise.resolve({ error: null })
        },
        delete: () => {
          ecritures.push(`${table}:delete`)
          return c
        },
      }
      return c
    },
  }
  return { admin: admin as never, tables, ecritures }
}

Deno.test('budget absent : le Comparison est quand même importé', async () => {
  const { admin, ecritures } = adminSansBudget()
  const n = await importComparison(admin, CSV, 'comparison.csv')
  assertEquals(n >= 1, true)
  assertEquals(ecritures.includes('daily_reports'), true)
})

Deno.test('l import ne lit même plus la table budget', async () => {
  const { admin, tables } = adminSansBudget()
  await importComparison(admin, CSV, 'comparison.csv', true)
  assertEquals(tables.includes('budget'), false)
})

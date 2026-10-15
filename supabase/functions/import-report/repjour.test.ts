// Lancer : `deno test --no-check --node-modules-dir=none supabase/functions/import-report/repjour.test.ts`
// (`--no-check` : la vérification de types exige les paquets npm de
// supabase-js, absents du poste ; le test n'en a pas besoin à l'exécution.)
//
// Un Comparison rejeté (422) est PERDU : le PMS ne le renvoie pas. Le budget du
// mois n'est ni écrit ni utilisé par l'import ; seul l'envoi automatique en a
// besoin, et il le contrôle lui-même (autoSend.ts). L'import ne doit donc pas
// l'exiger.

import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { importComparison, lireMontant, parseForecastAll } from './repjour.ts'

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

// --- Forecast : MÊMES cas que src/lib/repjour/parse/forecast.test.ts --------
// (les deux copies de la lecture doivent rester alignées).
const EN_TETE = 'DATE,OCC,OCC %,ADR,REV'

Deno.test('Forecast : virgule décimale, milliers, ambiguïté « 1,234 »', () => {
  const cas: [string | undefined, number | null][] = [
    ['7500.20', 7500.2],
    ['7500,20', 7500.2],
    ['7 500,20', 7500.2],
    ['7\u00A0500,20', 7500.2],
    ['444\u202F711,13', 444711.13],
    ['7.500,20', 7500.2],
    ['7,500.20', 7500.2],
    ['1,234,567', 1234567],
    ['1,234', 1.234],
    ['1.234', 1.234],
    ['Infinity', null],
    ['-Infinity', null],
    ['NaN', null],
    ['1e400', null],
    ['9'.repeat(400), null], // chiffres seuls mais hors des flottants (Infinity)
    ['12abc', null],
    ['1,234,56', null],
    ['', null],
    [undefined, null],
  ]
  for (const [cellule, attendu] of cas) assertEquals(lireMontant(cellule), attendu, String(cellule))
  const r = parseForecastAll('DATE;OCC;OCC %;ADR;REV\n01-01-2026;8;10%;100;7500,20\n')
  assertEquals(r[0].revTTC, 7500.2)
})

Deno.test('Forecast : dates impossibles écartées, 29-02 bissextile seulement', () => {
  const r = parseForecastAll(
    [EN_TETE, '31-02-2026,1,,1,1', '00-13-2026,1,,1,1', '29-02-2024,1,,1,1', '29-02-2026,1,,1,1', ''].join('\n'),
  )
  assertEquals(r.map((x) => x.date), ['2024-02-29'])
})

Deno.test('Forecast : Infinity → 0, jour en double → fichier refusé', () => {
  const r = parseForecastAll([EN_TETE, '01-01-2026,1,,1,Infinity', ''].join('\n'))
  assertEquals([r[0].revTTC, r[0].revHT], [0, 0])
  assertThrows(
    () => parseForecastAll([EN_TETE, '01-01-2026,1,,1,1', '1-1-2026,1,,1,2', ''].join('\n')),
    Error,
    'contient deux fois le jour 1-1-2026',
  )
})

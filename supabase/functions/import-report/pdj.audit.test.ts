// Audit de sécurité du 2026-10-17 (Edge Functions) — finding F2.
// Lancer : `deno test --no-check --node-modules-dir=none supabase/functions/import-report/pdj.audit.test.ts`
//
// ROUGE tant que le correctif n'est pas appliqué : l'import In-House accepte
// n'importe quel numéro de chambre que `Number()` sait lire (« -7 », « 0x10 »
// → 16, « 1e3 » → 1000, « 9001 ») et un nombre d'occupants arbitraire
// (30 000), puis les écrit dans `pdj_breakfasts` (reproduit en local contre
// la fonction servie, service_date 2001-01-01). L'hôtel a 80 chambres.

import { assertEquals } from 'jsr:@std/assert@1'
import { importInhouse } from './pdj.ts'

function fauxAdmin() {
  const ecrites: Array<Record<string, unknown>> = []
  const chaine = {
    lt: () => chaine,
    not: () => Promise.resolve({ error: null, count: 0 }),
  }
  const client = {
    from: () => ({
      upsert: (rows: Array<Record<string, unknown>>) => {
        ecrites.push(...rows)
        return Promise.resolve({ error: null })
      },
      update: () => chaine,
    }),
  }
  // deno-lint-ignore no-explicit-any
  return { client: client as any, ecrites }
}

const ENTETE = 'Room,Status,Guest Name,VIP,Adults,Children,Addons,Rate'

Deno.test('In-House : numéros de chambre hors format refusés (-7, 0x10, 1e3)', async () => {
  const { client, ecrites } = fauxAdmin()
  const csv = [
    ENTETE,
    '-7,IN HOUSE,a,,1,0,,',
    '0x10,IN HOUSE,b,,1,0,,',
    '1e3,IN HOUSE,c,,1,0,,',
    '9001,IN HOUSE,c,,1,0,,',
    // 101 n'existe pas (étage 1 de 102 à 114, src/lib/hotel/rooms.ts) : la
    // première version de ce test l'attendait à tort comme chambre valide.
    '101,IN HOUSE,c,,1,0,,',
    ' 102 ,IN HOUSE,d,,1,0,,',
  ].join('\n')
  const n = await importInhouse(client, csv, 'audit_in_house_20010101.csv')
  assertEquals(
    ecrites.map((r) => r.room),
    [102],
  )
  assertEquals(n, 1)
})

Deno.test('In-House : une ligne invalide est écartée, les autres importées', async () => {
  const { client, ecrites } = fauxAdmin()
  const csv = [
    ENTETE,
    '103,IN HOUSE,a,,-1,0,,',
    '104,IN HOUSE,b,,2,abc,,',
    '105,IN HOUSE,c,,,,,', // occupants vides = 0 (comportement historique)
    '106,IN HOUSE,d,,20,0,,',
  ].join('\n')
  await importInhouse(client, csv, 'audit_in_house_20010101.csv')
  assertEquals(
    ecrites.map((r) => [r.room, r.adults, r.children]),
    [
      [105, 0, 0],
      [106, 20, 0],
    ],
  )
})

Deno.test('In-House : nombre d’occupants borné', async () => {
  const { client, ecrites } = fauxAdmin()
  const csv = [ENTETE, '102,IN HOUSE,e,,30000,0,PDJ,'].join('\n')
  await importInhouse(client, csv, 'audit_in_house_20010101.csv').catch(() => {})
  for (const r of ecrites) assertEquals((r.guests as number) <= 20, true)
  assertEquals(ecrites.length, 0)
})

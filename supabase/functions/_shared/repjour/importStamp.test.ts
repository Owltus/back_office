// Lancer : `deno test supabase/functions/_shared/repjour/importStamp.test.ts`
//
// L'Edge Function tourne en UTC : ces tests fixent un instant UTC et attendent
// l'heure de PARIS, celle qu'affiche le PDF du navigateur.

import { assertEquals } from 'jsr:@std/assert@1'
import { formatImportStamp } from './importStamp.ts'

Deno.test('heure d été : UTC+2', () => {
  assertEquals(
    formatImportStamp('2026-09-28T00:32:05Z'),
    '28 septembre 2026 à 02h32',
  )
})

Deno.test('heure d hiver : UTC+1', () => {
  assertEquals(
    formatImportStamp('2026-01-15T08:05:00Z'),
    '15 janvier 2026 à 09h05',
  )
})

Deno.test('le jour suit Paris près de minuit (pas la veille UTC)', () => {
  // 23h30 UTC le 11/09 = 01h30 le 12/09 à Paris.
  assertEquals(
    formatImportStamp('2026-09-11T23:30:00Z'),
    '12 septembre 2026 à 01h30',
  )
})

Deno.test('minuit s écrit 00h, jamais 24h', () => {
  assertEquals(
    formatImportStamp('2026-09-27T22:00:00Z'),
    '28 septembre 2026 à 00h00',
  )
})

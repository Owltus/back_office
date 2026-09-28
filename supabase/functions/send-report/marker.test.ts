// Lancer : `deno test --no-check supabase/functions/send-report/marker.test.ts`
// (`--no-check` : la vérification de types exige les paquets npm de
// supabase-js, absents du poste ; le test n'en a pas besoin à l'exécution.)

import { assertEquals } from 'jsr:@std/assert@1'
import { poserMarqueurManuel } from './marker.ts'

/** Faux client : `update().eq()` résout avec la réponse donnée. */
function faux(reponse: { error: { message: string } | null }) {
  const vu: { table?: string; values?: unknown; col?: string; val?: string } =
    {}
  const client = {
    from(table: string) {
      vu.table = table
      return {
        update(values: unknown) {
          vu.values = values
          return {
            eq(col: string, val: string) {
              vu.col = col
              vu.val = val
              return Promise.resolve(reponse)
            },
          }
        },
      }
    },
  }
  return { client: client as never, vu }
}

/** Capture les `console.error` le temps d'un appel. */
async function erreursDe(fn: () => Promise<unknown>): Promise<string[]> {
  const original = console.error
  const lignes: string[] = []
  console.error = (...args: unknown[]) => lignes.push(args.join(' '))
  try {
    await fn()
  } finally {
    console.error = original
  }
  return lignes
}

Deno.test('succès : marqueur posé sur la bonne ligne, rien de journalisé', async () => {
  const { client, vu } = faux({ error: null })
  let ok = false
  const erreurs = await erreursDe(async () => {
    ok = await poserMarqueurManuel(client, '2026-09-27', Date.UTC(2026, 8, 28, 7))
  })
  assertEquals(ok, true)
  assertEquals(erreurs, [])
  assertEquals(vu.table, 'daily_reports')
  assertEquals(vu.values, { auto_sent_at: '2026-09-28T07:00:00.000Z' })
  assertEquals([vu.col, vu.val], ['date', '2026-09-27'])
})

Deno.test('erreur RENVOYÉE par supabase-js : lue et journalisée, sans lever', async () => {
  const { client } = faux({ error: { message: 'permission denied' } })
  let ok = true
  const erreurs = await erreursDe(async () => {
    ok = await poserMarqueurManuel(client, '2026-09-27', 0)
  })
  assertEquals(ok, false)
  assertEquals(erreurs.length, 1)
  assertEquals(erreurs[0].includes('permission denied'), true)
})

Deno.test('date invalide : aucune écriture', async () => {
  const { client, vu } = faux({ error: null })
  assertEquals(await poserMarqueurManuel(client, '27/09/2026', 0), false)
  assertEquals(vu.table, undefined)
})

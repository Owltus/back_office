// Rejoue la nuit du 2026-09-12 — celle où le rapport journalier n'est pas parti.
//
// Lancer : `deno test supabase/functions/import-report/waitAndSend.test.ts`
//
// Le temps est SIMULÉ (horloge et sommeil injectés) : la suite s'exécute en
// quelques millisecondes tout en raisonnant sur des minutes.
//
// Les faits rejoués sont ceux relevés en base :
//   - Comparison importé à 00:31:05,
//   - Forecast importé à 00:31:59, soit 54 secondes plus tard,
//   - aucun envoi, et aucune trace expliquant pourquoi.

import { assertEquals } from 'jsr:@std/assert@1'

import { waitThenAutoSend } from './waitAndSend.ts'
import type { AttemptFn, LogWriter, Outcome } from './waitAndSend.ts'

const INSTANT = new Date('2026-09-12T00:31:05.000Z') // 02:31 à Paris

/** Journal en mémoire : ce que la base aurait enregistré. */
function fakeLog() {
  const rows: Record<string, unknown>[] = []
  const writer: LogWriter = {
    from: () => ({
      insert: (row: unknown) => {
        rows.push(row as Record<string, unknown>)
        return Promise.resolve({ error: null })
      },
    }),
  }
  return { rows, writer }
}

/** Horloge et sommeil simulés : dormir fait simplement avancer l'heure. */
function fakeClock() {
  let t = 0
  return {
    now: () => t,
    sleep: (ms: number) => {
      t += ms
      return Promise.resolve()
    },
    advance: (ms: number) => {
      t += ms
    },
    get elapsed() {
      return t
    },
  }
}

/**
 * La nuit réelle : le Forecast n'est en base qu'à partir de la 54e seconde.
 * Avant, la tentative d'envoi s'abstient pour une raison TRANSITOIRE.
 */
function attemptsOfThatNight(clock: { now: () => number }): {
  fn: AttemptFn
  calls: () => number
} {
  let calls = 0
  const fn: AttemptFn = () => {
    calls += 1
    const outcome: Outcome =
      clock.now() >= 54_000
        ? { sent: true, note: 'envoyé le rapport du 2026-09-11', retryable: false }
        : {
            sent: false,
            note: 'Forecast pas frais (importé il y a 24 h) — envoi auto ignoré',
            retryable: true,
          }
    return Promise.resolve(outcome)
  }
  return { fn, calls: () => calls }
}

Deno.test("l'ancienne reprise de 4 secondes n'attrapait pas le Forecast", async () => {
  const clock = fakeClock()
  const { rows, writer } = fakeLog()
  const { fn, calls } = attemptsOfThatNight(clock)

  // Ancien comportement : une tentative, 4 secondes, une seconde tentative.
  await waitThenAutoSend(fn, writer, false, INSTANT, 'comparison', {
    retryEveryMs: 4_000,
    budgetMs: 4_000,
    sleep: clock.sleep,
    now: clock.now,
  })

  // Une tentative immédiate, quatre secondes d'attente, une seconde tentative :
  // c'est exactement tout ce que permettait l'ancien code.
  assertEquals(calls(), 2)
  assertEquals(
    rows.filter((r) => r.sent === true).length,
    0,
    'rien ne part : le Forecast arrive 50 secondes trop tard',
  )
  // Le renoncement est au moins ÉCRIT, ce qui manquait totalement cette nuit-là.
  assertEquals(String(rows[rows.length - 1].note).startsWith('abandon après'), true)
})

Deno.test('la patience de cinq minutes envoie le rapport à la 60e seconde', async () => {
  const clock = fakeClock()
  const { rows, writer } = fakeLog()
  const { fn, calls } = attemptsOfThatNight(clock)

  await waitThenAutoSend(fn, writer, false, INSTANT, 'comparison', {
    retryEveryMs: 15_000,
    budgetMs: 300_000,
    sleep: clock.sleep,
    now: clock.now,
  })

  // 0 s, 15 s, 30 s, 45 s, 60 s → la cinquième tentative trouve le Forecast.
  assertEquals(calls(), 5)
  assertEquals(clock.elapsed, 60_000)
  const envoi = rows.find((r) => r.sent === true)
  assertEquals(envoi?.attempt, 5)
  assertEquals(envoi?.waited_seconds, 60)
  assertEquals(envoi?.trigger_report, 'comparison')
})

Deno.test('l’invocation du Comparison suffit : celle du Forecast peut mourir', async () => {
  // C'est tout l'objet du correctif. Cette nuit-là, l'invocation du Forecast
  // n'a pas abouti ; celle du Comparison avait renoncé. Désormais la seconde
  // couvre la première, et il faut que LES DEUX tombent pour que rien ne parte.
  const clock = fakeClock()
  const { rows, writer } = fakeLog()
  const { fn } = attemptsOfThatNight(clock)

  await waitThenAutoSend(fn, writer, false, INSTANT, 'comparison', {
    retryEveryMs: 15_000,
    budgetMs: 300_000,
    sleep: clock.sleep,
    now: clock.now,
  })
  assertEquals(rows.some((r) => r.sent === true), true)
})

Deno.test('une raison définitive arrête tout de suite, sans attendre pour rien', async () => {
  const clock = fakeClock()
  const { rows, writer } = fakeLog()
  let calls = 0
  const fn: AttemptFn = () => {
    calls += 1
    return Promise.resolve({
      sent: false,
      note: 'budget absent pour 9/2026',
      retryable: false,
    })
  }

  await waitThenAutoSend(fn, writer, false, INSTANT, 'forecast', {
    retryEveryMs: 15_000,
    budgetMs: 300_000,
    sleep: clock.sleep,
    now: clock.now,
  })

  assertEquals(calls, 1, 'patienter ne ferait pas apparaître un budget')
  assertEquals(clock.elapsed, 0)
  assertEquals(rows.length, 1)
})

Deno.test('« déjà envoyé » par l’invocation sœur : on s’arrête, pas de doublon', async () => {
  const clock = fakeClock()
  const { rows, writer } = fakeLog()
  let calls = 0
  const fn: AttemptFn = () => {
    calls += 1
    return Promise.resolve({
      sent: false,
      note: 'déjà réservé/envoyé (course évitée)',
      retryable: false,
    })
  }

  await waitThenAutoSend(fn, writer, false, INSTANT, 'forecast', {
    retryEveryMs: 15_000,
    budgetMs: 300_000,
    sleep: clock.sleep,
    now: clock.now,
  })
  assertEquals(calls, 1)
  assertEquals(rows.some((r) => r.sent === true), false)
})

Deno.test('le Forecast qui ne viendra jamais : abandon DIT, après cinq minutes', async () => {
  const clock = fakeClock()
  const { rows, writer } = fakeLog()
  let calls = 0
  const fn: AttemptFn = () => {
    calls += 1
    return Promise.resolve({
      sent: false,
      note: 'Forecast absent pour ce mois — envoi auto ignoré',
      retryable: true,
    })
  }

  await waitThenAutoSend(fn, writer, false, INSTANT, 'comparison', {
    retryEveryMs: 15_000,
    budgetMs: 300_000,
    sleep: clock.sleep,
    now: clock.now,
  })

  // 21 tentatives : une par quart de minute de 0 à 300 secondes incluses.
  assertEquals(calls, 21)
  const dernier = rows[rows.length - 1]
  assertEquals(dernier.sent, false)
  assertEquals(dernier.waited_seconds, 300)
  assertEquals(
    String(dernier.note),
    "abandon après 300s d'attente et 21 tentative(s) — dernière raison : Forecast absent pour ce mois — envoi auto ignoré",
  )
})

Deno.test('chaque tentative laisse une trace lisible en base', async () => {
  const clock = fakeClock()
  const { rows, writer } = fakeLog()
  const { fn } = attemptsOfThatNight(clock)

  await waitThenAutoSend(fn, writer, false, INSTANT, 'forecast', {
    retryEveryMs: 15_000,
    budgetMs: 300_000,
    sleep: clock.sleep,
    now: clock.now,
  })

  assertEquals(rows.length, 5)
  assertEquals(
    rows.map((r) => r.waited_seconds),
    [0, 15, 30, 45, 60],
  )
  // Le cycle hôtelier du 2026-09-12 02:31 (Paris) est bien le 12, pas le 11.
  assertEquals(rows[0].cycle_date, '2026-09-12')
  assertEquals(rows[0].trigger_report, 'forecast')
})

// Rejoue la nuit du 2026-09-12 — celle où le rapport journalier n'est pas parti.
//
// Ce qui est éprouvé ici, c'est la VEILLE : le filet qui prend le relais quand
// l'arrivée du second rapport n'a pas suffi à déclencher l'envoi. Le chemin
// normal, lui, ne dépend d'aucune horloge — c'est l'arrivée du dernier des deux
// rapports qui fait partir le mail, qu'elle survienne après une minute ou après
// onze.
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

Deno.test("l'ancienne reprise de 4 secondes ne voyait pas arriver le Forecast", async () => {
  const clock = fakeClock()
  const { rows, writer } = fakeLog()
  const { fn, calls } = attemptsOfThatNight(clock)

  // Ancien comportement : un contrôle, 4 secondes, un second contrôle.
  await waitThenAutoSend(fn, writer, false, INSTANT, 'comparison', {
    retryEveryMs: 4_000,
    budgetMs: 4_000,
    sleep: clock.sleep,
    now: clock.now,
  })

  // Un contrôle immédiat, quatre secondes, un second contrôle : c'est
  // exactement tout ce que permettait l'ancien code.
  assertEquals(calls(), 2)
  assertEquals(
    rows.filter((r) => r.sent === true).length,
    0,
    'rien ne part : le Forecast arrive 50 secondes trop tard',
  )
  // Le renoncement est au moins ÉCRIT, ce qui manquait totalement cette nuit-là.
  assertEquals(String(rows[rows.length - 1].note).startsWith('fin de veille'), true)
})

Deno.test('la veille voit le Forecast se poser et envoie à la 60e seconde', async () => {
  const clock = fakeClock()
  const { rows, writer } = fakeLog()
  const { fn, calls } = attemptsOfThatNight(clock)

  await waitThenAutoSend(fn, writer, false, INSTANT, 'comparison', {
    retryEveryMs: 15_000,
    budgetMs: 90_000,
    sleep: clock.sleep,
    now: clock.now,
  })

  // Coups d'œil à 0, 15, 30, 45 et 60 s : le cinquième voit le Forecast.
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
    budgetMs: 90_000,
    sleep: clock.sleep,
    now: clock.now,
  })
  assertEquals(rows.some((r) => r.sent === true), true)
})

Deno.test('une situation sans issue se retire tout de suite, sans veiller pour rien', async () => {
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
    budgetMs: 90_000,
    sleep: clock.sleep,
    now: clock.now,
  })

  assertEquals(calls, 1, 'veiller ne ferait pas apparaître un budget')
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
    budgetMs: 90_000,
    sleep: clock.sleep,
    now: clock.now,
  })
  assertEquals(calls, 1)
  assertEquals(rows.some((r) => r.sent === true), false)
})

Deno.test('le Forecast qui ne viendra jamais : fin de veille DITE, et écrite', async () => {
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
    budgetMs: 90_000,
    sleep: clock.sleep,
    now: clock.now,
  })

  // Budget 90 s, un coup d'œil tous les quarts de minute : 0, 15, … 90.
  assertEquals(calls, 7)
  const dernier = rows[rows.length - 1]
  assertEquals(dernier.sent, false)
  assertEquals(dernier.waited_seconds, 90)
  assertEquals(
    String(dernier.note),
    'fin de veille après 90s sans que la donnée attendue se pose (7 contrôles) — dernier état : Forecast absent pour ce mois — envoi auto ignoré',
  )
})

Deno.test('chaque coup d’œil laisse une trace lisible en base', async () => {
  const clock = fakeClock()
  const { rows, writer } = fakeLog()
  const { fn } = attemptsOfThatNight(clock)

  await waitThenAutoSend(fn, writer, false, INSTANT, 'forecast', {
    retryEveryMs: 15_000,
    budgetMs: 90_000,
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

/* --------------------------------------------------------------------------
 * Défauts relevés par l'audit adversarial du 2026-09-12, figés ici pour qu'ils
 * ne puissent pas revenir.
 * ------------------------------------------------------------------------ */

Deno.test('le mode sobre écrit au CHANGEMENT d état, pas à chaque passage', async () => {
  // La veille planifiée repasse toutes les deux minutes. Écrire à chaque fois
  // noierait la nuit ; ne rien écrire du tout — le premier jet — laissait le
  // journal VIDE les nuits sans e-mail, c'est-à-dire celles qu'il documente.
  const clock = fakeClock()
  const { rows, writer } = fakeLog()
  const immobile: AttemptFn = () =>
    Promise.resolve({
      sent: false,
      note: 'aucun rapport pour le cycle 2026-09-12 — en attente du Comparison',
      retryable: true,
    })

  // Premier passage de la nuit : rien n'est encore connu → on écrit.
  await waitThenAutoSend(immobile, writer, false, INSTANT, 'veille planifiée', {
    budgetMs: 0,
    quiet: true,
    lastNote: null,
    sleep: clock.sleep,
    now: clock.now,
  })
  assertEquals(rows.length, 1)

  // Passages suivants, état inchangé : on se tait.
  for (let i = 0; i < 5; i++) {
    await waitThenAutoSend(immobile, writer, false, INSTANT, 'veille planifiée', {
      budgetMs: 0,
      quiet: true,
      lastNote: String(rows[rows.length - 1].note),
      sleep: clock.sleep,
      now: clock.now,
    })
  }
  assertEquals(rows.length, 1)

  // L'état change : on l'écrit.
  const change: AttemptFn = () =>
    Promise.resolve({
      sent: false,
      note: 'Forecast pas frais (importé il y a 24 h) — envoi auto ignoré',
      retryable: true,
    })
  await waitThenAutoSend(change, writer, false, INSTANT, 'veille planifiée', {
    budgetMs: 0,
    quiet: true,
    lastNote: String(rows[rows.length - 1].note),
    sleep: clock.sleep,
    now: clock.now,
  })
  assertEquals(rows.length, 2)
})

Deno.test('le mode sobre écrit une anomalie UNE fois, pas à chaque passage', async () => {
  // Une anomalie qui dure toute la nuit doit se voir — une fois, horodatée.
  // L'écrire à chaque passage noierait la nuit sous des lignes identiques ; ne
  // jamais l'écrire laisserait le journal muet. C'est le changement d'état qui
  // fait foi, et une anomalie qui apparaît EST un changement.
  const clock = fakeClock()
  const { rows, writer } = fakeLog()
  const refus: AttemptFn = () =>
    Promise.resolve({
      sent: false,
      note: 'envoi échoué (Aucun destinataire actif (type « to »))',
      retryable: false,
    })
  // Première apparition : l'état change, on écrit.
  await waitThenAutoSend(refus, writer, false, INSTANT, 'veille planifiée', {
    budgetMs: 0,
    quiet: true,
    lastNote: 'Forecast pas frais (importé il y a 24 h) — envoi auto ignoré',
    sleep: clock.sleep,
    now: clock.now,
  })
  assertEquals(rows.length, 1)
  assertEquals(rows[0].retryable, false)
  assertEquals(rows[0].sent, false)

  // Passages suivants, même anomalie : on se tait.
  for (let i = 0; i < 10; i++) {
    await waitThenAutoSend(refus, writer, false, INSTANT, 'veille planifiée', {
      budgetMs: 0,
      quiet: true,
      lastNote: String(rows[0].note),
      sleep: clock.sleep,
      now: clock.now,
    })
  }
  assertEquals(rows.length, 1)
})

Deno.test('un seul coup d œil ne parle jamais de « fin de veille »', async () => {
  // Avec `budgetMs: 0`, l'ancienne condition passait systématiquement par la
  // branche de clôture et émettait une ERREUR « fin de veille après 0s » à
  // chaque passage de la minuterie — pour une situation parfaitement normale.
  const clock = fakeClock()
  const { rows, writer } = fakeLog()
  await waitThenAutoSend(
    () =>
      Promise.resolve({
        sent: false,
        note: 'Forecast pas frais (importé il y a 24 h) — envoi auto ignoré',
        retryable: true,
      }),
    writer,
    false,
    INSTANT,
    'veille planifiée',
    { budgetMs: 0, sleep: clock.sleep, now: clock.now },
  )
  assertEquals(rows.length, 1)
  assertEquals(
    rows.some((r) => String(r.note).startsWith('fin de veille')),
    false,
  )
})

Deno.test("l heure est RELUE à chaque contrôle, pas figée au départ", async () => {
  // Une veille ouverte à 01h58 concluait « hors fenêtre » et n'essayait plus
  // jamais, alors que la fenêtre s'ouvrait deux minutes plus tard.
  const clock = fakeClock()
  const { writer } = fakeLog()
  const vues: number[] = []
  const fn: AttemptFn = (_admin, _dry, at) => {
    vues.push(at.getTime())
    return Promise.resolve({
      sent: false,
      note: 'Forecast absent pour ce mois — envoi auto ignoré',
      retryable: true,
    })
  }
  await waitThenAutoSend(fn, writer, false, INSTANT, 'comparison', {
    retryEveryMs: 15_000,
    budgetMs: 45_000,
    sleep: clock.sleep,
    now: clock.now,
  })
  // Quatre contrôles, quatre instants DISTINCTS et croissants.
  assertEquals(vues.length, 4)
  assertEquals(new Set(vues).size, 4)
  assertEquals(
    vues.every((t, i) => i === 0 || t > vues[i - 1]),
    true,
  )
})

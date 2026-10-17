// Classement des échecs Resend par `sendMail`.
//
// Lancer : `deno test --no-check supabase/functions/_shared/send-mail.test.ts`
// (`--no-check` : la vérification de types exige les paquets npm de
// supabase-js, absents du poste ; le test n'en a pas besoin à l'exécution.)
//
// Ce qui compte ici, c'est `certainNotSent` : il autorise l'appelant à libérer la
// réservation d'envoi. Le poser à tort sur une issue où l'e-mail a pu partir,
// c'est ouvrir la porte à un doublon.

import { assertEquals } from 'jsr:@std/assert@1'
import { sendMail } from './send-mail.ts'

/** Remplace `fetch` le temps d'un appel, avec une réponse Resend figée. */
async function avecResend(
  status: number,
  corps: string,
  fn: () => Promise<void>,
): Promise<number> {
  const original = globalThis.fetch
  let appels = 0
  globalThis.fetch = (() => {
    appels++
    return Promise.resolve(new Response(corps, { status }))
  }) as typeof fetch
  try {
    await fn()
  } finally {
    globalThis.fetch = original
  }
  return appels
}

const base = {
  // Jamais lu : la liste blanche de test court-circuite la table.
  admin: {} as never,
  from: 'Rep Jour <noreply@example.com>',
  subject: 'Rapport',
  html: '<!doctype html><p>x</p>',
  recipientsTable: 'server_report_recipients',
  resendKey: 'cle',
  testTo: 'test@example.com',
  idempotencyKey: 'repjour-2026-09-28',
}

Deno.test('409 concurrent (même clé encore en cours) = issue AMBIGUË', async () => {
  const appels = await avecResend(
    409,
    '{"name":"concurrent_idempotent_requests"}',
    async () => {
      const r = await sendMail(base)
      assertEquals(r.ok, false)
      // L'e-mail a pu partir sous cette clé : la réservation doit être gardée.
      assertEquals(r.certainNotSent, false)
      assertEquals(r.retryable, false)
    },
  )
  // Pas de nouvelle tentative : insister ne changerait rien et risquerait pire.
  assertEquals(appels, 1)
})

Deno.test('409 autre que « concurrent » = rejet visible, pas une journée brûlée', async () => {
  await avecResend(409, '{"name":"invalid_idempotent_request"}', async () => {
    const r = await sendMail(base)
    assertEquals(r.ok, false)
    // Clé déjà vue avec un AUTRE contenu : la classer ambiguë marquerait la
    // journée envoyée sans e-mail. Échec visible, rattrapable à la main.
    assertEquals(r.certainNotSent, true)
    assertEquals(r.retryable, false)
  })
})

Deno.test('422 (rejet explicite) reste « certainement pas envoyé »', async () => {
  await avecResend(422, '{"name":"validation_error"}', async () => {
    const r = await sendMail(base)
    assertEquals(r.ok, false)
    assertEquals(r.certainNotSent, true)
    assertEquals(r.retryable, false)
  })
})

Deno.test('200 = succès', async () => {
  await avecResend(200, '{"id":"abc"}', async () => {
    const r = await sendMail(base)
    assertEquals(r.ok, true)
    assertEquals(r.id, 'abc')
  })
})

Deno.test('contenu non chaîne (tableau, nombre) refusé AVANT tout envoi', async () => {
  // Audit du 2026-10-17 : un tableau en `html` / `pdfBase64` passait tel quel
  // au transport ; un nombre en `subject` faisait lever `.trim()`.
  for (const mauvais of [
    { html: ['<p>x</p>'] },
    { subject: 5 },
    { pdfBase64: ['JVBERi0='] },
    { pdfName: ['a.pdf'] },
    { pdfBytes: [1, 2, 3] },
  ]) {
    const appels = await avecResend(200, '{"id":"x"}', async () => {
      const r = await sendMail({ ...base, ...(mauvais as object) } as never)
      assertEquals(r.ok, false, JSON.stringify(mauvais))
      assertEquals(r.error, 'Contenu du message invalide')
      assertEquals(r.certainNotSent, true)
    })
    assertEquals(appels, 0)
  }
  // Témoin : le contenu légitime part.
  const appels = await avecResend(200, '{"id":"x"}', async () => {
    assertEquals((await sendMail(base)).ok, true)
  })
  assertEquals(appels, 1)
})

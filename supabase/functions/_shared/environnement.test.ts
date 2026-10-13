// Lancer : `deno test --no-check supabase/functions/_shared/environnement.test.ts`
//
// Oracle : le plan (étape 8, D12-B) — en local, Mailpit et la clé de la
// stack, quelles que soient les autres variables ; ailleurs, rien ne change.

import { assert, assertEquals } from 'jsr:@std/assert@1'

import {
  MAILPIT_DEFAUT,
  cleResend,
  cleServeur,
  corpsMailpit,
  estLocal,
  transportMail,
} from './environnement.ts'
import { sendMail } from './send-mail.ts'

const PROD = 'https://projet-prod.supabase.co'

Deno.test('estLocal : hôtes de la stack seulement', () => {
  for (const u of [
    'http://kong:8000',
    'http://supabase_kong_back-office:8000',
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'http://[::1]:54321',
    'http://host.docker.internal:54321',
    'http://api.localhost',
  ]) assert(estLocal(u), u)
  for (const u of [
    PROD,
    'https://kong.exemple.com',
    'https://localhost.exemple.com',
    'http://127.0.0.2',
    'pas une url',
    '',
    undefined,
    null,
  ]) assert(!estLocal(u), String(u))
})

// Table de vérité : (local | prod) × (clé locale | clé prod | absente) ×
// (REPORT_TEST_TO posé ou non) × (RESEND_API_KEY posée ou non).
const URLS = { local: 'http://kong:8000', prod: PROD } as const
const SB = { locale: 'cle-de-la-stack', prod: 'sb_secret_prod', absente: undefined } as const

for (const [lieu, url] of Object.entries(URLS)) {
  for (const [nomSb, sb] of Object.entries(SB)) {
    for (const testTo of [undefined, 'test@exemple.test']) {
      for (const resend of [undefined, 're_cle']) {
        Deno.test(`${lieu} · SB ${nomSb} · testTo ${testTo ?? '—'} · resend ${resend ?? '—'}`, () => {
          const env: Record<string, string | undefined> = {
            SUPABASE_URL: url,
            SUPABASE_SERVICE_ROLE_KEY: 'cle-de-la-stack',
            SB_SECRET_KEY: sb,
            REPORT_TEST_TO: testTo,
            RESEND_API_KEY: resend,
          }
          const lire = (n: string) => env[n]
          const t = transportMail(lire)
          if (lieu === 'local') {
            assertEquals(t, { genre: 'mailpit', url: MAILPIT_DEFAUT })
            assertEquals(cleServeur(lire), 'cle-de-la-stack')
            assertEquals(cleResend(lire), 'mailpit-local')
          } else {
            assertEquals(t, { genre: 'resend', cle: resend })
            assertEquals(cleServeur(lire), sb)
            assertEquals(cleResend(lire), resend)
          }
        })
      }
    }
  }
}

Deno.test('MAILPIT_URL remplace le défaut, en local seulement', () => {
  const env: Record<string, string> = { SUPABASE_URL: 'http://kong:8000', MAILPIT_URL: 'http://ailleurs:8025' }
  assertEquals(transportMail((n) => env[n]), { genre: 'mailpit', url: 'http://ailleurs:8025' })
  env.SUPABASE_URL = PROD
  assertEquals(transportMail((n) => env[n]).genre, 'resend')
})

Deno.test('corpsMailpit : expéditeur décomposé, copie et pièce jointe', () => {
  assertEquals(
    corpsMailpit({
      from: 'Rep Jour <noreply@exemple.test>',
      to: ['a@exemple.test'],
      cc: ['b@exemple.test'],
      subject: 'S',
      html: '<p>x</p>',
      piece: { filename: 'r.pdf', content: 'QUJD' },
    }),
    {
      From: { Name: 'Rep Jour', Email: 'noreply@exemple.test' },
      To: [{ Email: 'a@exemple.test' }],
      Cc: [{ Email: 'b@exemple.test' }],
      Subject: 'S',
      HTML: '<p>x</p>',
      Attachments: [{ Filename: 'r.pdf', Content: 'QUJD' }],
    },
  )
  assertEquals(
    corpsMailpit({ from: 'x@exemple.test', to: ['a@exemple.test'], cc: [], subject: 'S', html: 'h' }),
    { From: { Email: 'x@exemple.test' }, To: [{ Email: 'a@exemple.test' }], Subject: 'S', HTML: 'h' },
  )
})

/** Remplace `fetch` et note les URL appelées. */
async function appelsDe(fn: () => Promise<void>): Promise<string[]> {
  const original = globalThis.fetch
  const urls: string[] = []
  globalThis.fetch = ((input: string | URL | Request) => {
    urls.push(String(input instanceof Request ? input.url : input))
    return Promise.resolve(new Response('{"ID":"m1"}', { status: 200 }))
  }) as typeof fetch
  try {
    await fn()
  } finally {
    globalThis.fetch = original
  }
  return urls
}

const message = {
  admin: {} as never,
  from: 'Rep Jour <noreply@exemple.test>',
  subject: 'Rapport',
  html: '<!doctype html><p>x</p>',
  recipientsTable: 'server_report_recipients',
  resendKey: 're_vraie_cle',
  testTo: 'test@exemple.test',
}

Deno.test('sendMail en local : Mailpit, jamais Resend, même avec une clé Resend', async () => {
  const urls = await appelsDe(async () => {
    const r = await sendMail({ ...message, lire: (n) => ({ SUPABASE_URL: 'http://kong:8000' })[n] })
    assertEquals(r.ok, true)
    assertEquals(r.id, 'm1')
  })
  assertEquals(urls, [`${MAILPIT_DEFAUT}/api/v1/send`])
  assert(urls.every((u) => !u.includes('resend.com')))
})

Deno.test('sendMail hors local : Resend, comme avant', async () => {
  const urls = await appelsDe(async () => {
    const r = await sendMail({ ...message, lire: (n) => ({ SUPABASE_URL: PROD })[n] })
    assertEquals(r.ok, true)
  })
  assertEquals(urls, ['https://api.resend.com/emails'])
})

Deno.test('sendMail en local, Mailpit en erreur : échec certain et réessayable', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (() => Promise.resolve(new Response('non', { status: 500 }))) as typeof fetch
  try {
    const r = await sendMail({ ...message, lire: (n) => ({ SUPABASE_URL: 'http://kong:8000' })[n] })
    assertEquals([r.ok, r.certainNotSent, r.retryable], [false, true, true])
  } finally {
    globalThis.fetch = original
  }
})

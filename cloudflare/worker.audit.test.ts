import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error module JS sans types
import worker from './stayntouch_in_to_supabase.js'

/*
 * Audit de sécurité du 2026-10-17 — Worker e-mail.
 * Le Worker est exercé TEL QUEL (export par défaut), avec un faux message
 * Cloudflare et un `fetch` simulé : oracle = relais vers l'Edge Function
 * (avec le secret) ou `setReject`.
 */

const ENV = {
  IMPORT_ENDPOINT: 'https://exemple.invalid/functions/v1/import-report',
  IMPORT_SECRET: 'secret-de-test',
  REQUIRE_SENDER_AUTH: 'true',
}

function message(from: string, headers: Record<string, string>) {
  const h = new Headers(headers)
  return {
    from,
    to: 'backoffice@exemple.invalid',
    headers: h,
    raw: new Response('Subject: x\r\n\r\ncorps').body,
    rawSize: 20,
    setReject: vi.fn(),
  }
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response('ok', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function relaye(from: string, headers: Record<string, string>) {
  const m = message(from, headers)
  await worker.email(m, ENV)
  return {
    relaye: fetchMock.mock.calls.length > 0,
    rejet: m.setReject.mock.calls.length > 0,
  }
}

describe('ce qui tient', () => {
  it.each([
    'x@evil.com',
    'x@stayntouch.com.evil',
    'x@pms.stayntouch-support.evil',
    'x@evil.stayntouch.com',
    'x@stayntouch.com.',
    '',
  ])('domaine non autorisé refusé : %s', async (from) => {
    const r = await relaye(from, {
      'authentication-results':
        'mx.cloudflare.net; dkim=pass; spf=pass; dmarc=pass',
    })
    expect(r).toEqual({ relaye: false, rejet: true })
  })

  it('domaine autorisé sans aucun résultat pass : refusé', async () => {
    const r = await relaye('pms@stayntouch.com', {
      'authentication-results':
        'mx.cloudflare.net; dkim=none; spf=fail smtp.mailfrom=pms@stayntouch.com; dmarc=none',
    })
    expect(r).toEqual({ relaye: false, rejet: true })
  })

  it('cron inconnu : aucun appel', async () => {
    await worker.scheduled({ cron: '* 4-22 * * *' }, ENV)
    await worker.scheduled({ cron: '*/2 0-4 * * * ' }, ENV)
    await worker.scheduled(undefined, ENV)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('la veille envoie le secret, la sonde ne l’envoie jamais', async () => {
    await worker.scheduled(
      { cron: '*/10 4-22 * * *' },
      {
        ...ENV,
        SUPABASE_URL: 'https://exemple.invalid',
        SUPABASE_PUBLISHABLE_KEY: 'pub',
      },
    )
    const [, initSonde] = fetchMock.mock.calls[0]
    expect(JSON.stringify(initSonde)).not.toContain('secret-de-test')
    fetchMock.mockClear()
    await worker.scheduled({ cron: '*/2 0-4 * * *' }, ENV)
    expect(fetchMock.mock.calls[0][0]).toBe(ENV.IMPORT_ENDPOINT)
  })
})

/*
 * FINDING : `senderAuthPassed` cherche `(dmarc|dkim|spf)=pass` N'IMPORTE OÙ
 * dans Authentication-Results, sans vérifier ni l'authserv-id, ni le domaine
 * aligné, ni que le jeton est un RÉSULTAT (et non un commentaire ou une valeur
 * de propriété). Ces tests DOCUMENTENT le défaut : ils passent aujourd'hui
 * (relais avec le secret) et devront être inversés quand il sera corrigé.
 */
describe('FINDING — contrôle SPF/DKIM/DMARC contournable', () => {
  it('A. adresse d’enveloppe dont la partie locale est « spf=pass » : un en-tête Cloudflare en ÉCHEC est lu comme pass', async () => {
    const r = await relaye('spf=pass@stayntouch.com', {
      'authentication-results':
        'mx.cloudflare.net; dkim=none; dmarc=none header.from=stayntouch.com; spf=fail (mx.cloudflare.net: domain of spf=pass@stayntouch.com does not designate 203.0.113.9 as permitted sender) smtp.mailfrom=spf=pass@stayntouch.com',
    })
    expect(r).toEqual({ relaye: true, rejet: false })
  })

  it('B. DKIM valide d’un AUTRE domaine (header.d=evil.example) accepté', async () => {
    const r = await relaye('pms@stayntouch.com', {
      'authentication-results':
        'mx.cloudflare.net; dkim=pass header.d=evil.example; spf=fail smtp.mailfrom=pms@stayntouch.com; dmarc=fail header.from=stayntouch.com',
    })
    expect(r).toEqual({ relaye: true, rejet: false })
  })

  it('C. en-tête X-CF-Authentication-Results fourni par l’expéditeur accepté (authserv-id non vérifié)', async () => {
    const r = await relaye('pms@stayntouch.com', {
      'authentication-results':
        'mx.cloudflare.net; dkim=none; spf=fail; dmarc=none',
      'x-cf-authentication-results': 'attaquant.example; dmarc=pass',
    })
    expect(r).toEqual({ relaye: true, rejet: false })
  })
})

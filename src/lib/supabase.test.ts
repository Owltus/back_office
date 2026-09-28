import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchWithTimeout } from '#/lib/supabase.ts'
import { backendHealth } from '#/lib/backendHealth.ts'

/*
 * LE DISJONCTEUR SUR LE CHEMIN DES DONNÉES.
 *
 * Le disjoncteur existait depuis la panne du 2026-09-05, mais RIEN ne le
 * consultait avant d'émettre une requête de données. Pendant les quarante
 * minutes de panne du 2026-09-24, chaque lecture partait quand même,
 * attendait son délai de garde de 20 s, échouait, puis était réessayée deux
 * fois — une vingtaine de lectures par page, sur une base déjà à terre.
 *
 * Ces tests figent les trois règles du correctif, y compris l'EXEMPTION de
 * l'authentification, qui est une décision et non un oubli.
 */

const reponseOk = () =>
  new Response('{}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

/** Rouvre le disjoncteur : un backend qui répond le referme. */
function refermerDisjoncteur() {
  backendHealth.reportSuccess()
}

/** Ouvre le disjoncteur comme le ferait une vraie panne (5xx). */
function ouvrirDisjoncteur() {
  backendHealth.reportFailure({ status: 503 })
}

describe('fetchWithTimeout — disjoncteur', () => {
  let appels: Array<string>

  beforeEach(() => {
    appels = []
    refermerDisjoncteur()
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        appels.push(typeof input === 'string' ? input : String(input))
        return Promise.resolve(reponseOk())
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    refermerDisjoncteur()
  })

  it('laisse passer quand le backend répond', async () => {
    const res = await fetchWithTimeout(
      'https://exemple.test/rest/v1/hotel_config',
    )
    expect(res.status).toBe(200)
    expect(appels).toHaveLength(1)
  })

  it('N’ÉMET RIEN quand le disjoncteur est ouvert', async () => {
    ouvrirDisjoncteur()
    expect(backendHealth.shouldSkip()).toBe(true)

    await expect(
      fetchWithTimeout('https://exemple.test/rest/v1/hotel_config'),
    ).rejects.toThrow(/disjoncteur ouvert/i)

    // LE point du correctif : aucune requête n'a atteint le réseau.
    expect(appels).toHaveLength(0)
  })

  it('lève une erreur reconnue comme une PANNE, pas comme une erreur métier', async () => {
    // `status: 503` est ce qui la fait traiter par le bandeau et les gardes
    // comme une panne. Sans lui, l'utilisateur verrait un message inexact.
    ouvrirDisjoncteur()
    const err = await fetchWithTimeout('https://exemple.test/rest/v1/x').catch(
      (e: unknown) => e,
    )
    expect((err as { status?: number }).status).toBe(503)
  })

  it('N’ENFERME JAMAIS l’authentification dehors', async () => {
    // Décision explicite : l'authentification est la porte d'entrée de
    // l'application. Un disjoncteur ouvert à tort y bloquerait tout le monde,
    // alors que la tempête à éteindre est celle des lectures de données.
    ouvrirDisjoncteur()
    expect(backendHealth.shouldSkip()).toBe(true)

    const res = await fetchWithTimeout('https://exemple.test/auth/v1/token')
    expect(res.status).toBe(200)
    expect(appels).toHaveLength(1)
  })

  it('repasse le trafic dès que le disjoncteur se referme', async () => {
    // Demi-ouvert : à l'échéance du backoff, une requête passe et referme (ou
    // rallonge). Ici on simule la fermeture par un succès.
    ouvrirDisjoncteur()
    refermerDisjoncteur()
    expect(backendHealth.shouldSkip()).toBe(false)

    await fetchWithTimeout('https://exemple.test/rest/v1/hotel_config')
    expect(appels).toHaveLength(1)
  })

  it('une requête EN FILE n’est pas émise si le disjoncteur s’ouvre pendant qu’elle attend', async () => {
    // Six requêtes occupent les six jetons ; la septième attend. Les six
    // échouent en 503 (panne) : la septième obtient alors un jeton, mais le
    // disjoncteur est ouvert — elle ne doit RIEN émettre.
    const enAttente: Array<(r: Response) => void> = []
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        appels.push(typeof input === 'string' ? input : String(input))
        return new Promise<Response>((res) => enAttente.push(res))
      }),
    )

    const occupantes = Array.from({ length: 6 }, (_, i) =>
      fetchWithTimeout(`https://exemple.test/rest/v1/t${i}`),
    )
    const septieme = fetchWithTimeout('https://exemple.test/rest/v1/t6').catch(
      (e: unknown) => e,
    )
    await new Promise((r) => setTimeout(r, 0))
    expect(appels).toHaveLength(6)

    for (const res of enAttente) res(new Response('', { status: 503 }))
    await Promise.all(occupantes)

    const err = await septieme
    expect((err as { status?: number }).status).toBe(503)
    expect((err as Error).message).toMatch(/disjoncteur ouvert/i)
    // LE point du correctif : la septième n'a jamais atteint le réseau.
    expect(appels).toHaveLength(6)
  })
})

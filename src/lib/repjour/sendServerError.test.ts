import { describe, expect, it } from 'vitest'

import {
  MESSAGE_ENVOI_ECHOUE,
  messageErreurEnvoi,
} from '#/lib/repjour/sendServerError.ts'

/** Forme d'une FunctionsHttpError : `context` = la Response brute. */
function erreurHttp(status: number, corps: string): Error {
  return Object.assign(
    new Error('Edge Function returned a non-2xx status code'),
    {
      context: new Response(corps, { status }),
    },
  )
}

describe('messageErreurEnvoi', () => {
  it("affiche le message de l'anti-spam (429) au lieu d'un échec générique", async () => {
    const msg = 'Petit délai anti-doublon. Réessaie dans 8 s.'
    expect(
      await messageErreurEnvoi(erreurHttp(429, JSON.stringify({ error: msg }))),
    ).toBe(msg)
  })

  it('affiche aussi un refus de droits', async () => {
    expect(
      await messageErreurEnvoi(
        erreurHttp(
          403,
          JSON.stringify({ error: 'Réservé aux administrateurs' }),
        ),
      ),
    ).toBe('Réservé aux administrateurs')
  })

  it('corps non JSON, vide ou sans message : générique', async () => {
    expect(await messageErreurEnvoi(erreurHttp(502, '<html>'))).toBe(
      MESSAGE_ENVOI_ECHOUE,
    )
    expect(await messageErreurEnvoi(erreurHttp(500, '{}'))).toBe(
      MESSAGE_ENVOI_ECHOUE,
    )
    expect(
      await messageErreurEnvoi(erreurHttp(500, JSON.stringify({ error: 42 }))),
    ).toBe(MESSAGE_ENVOI_ECHOUE)
  })

  it('message démesuré : générique', async () => {
    expect(
      await messageErreurEnvoi(
        erreurHttp(400, JSON.stringify({ error: 'x'.repeat(500) })),
      ),
    ).toBe(MESSAGE_ENVOI_ECHOUE)
  })

  it('erreur réseau (pas de réponse) : générique', async () => {
    expect(await messageErreurEnvoi(new Error('Failed to fetch'))).toBe(
      MESSAGE_ENVOI_ECHOUE,
    )
    expect(await messageErreurEnvoi(null)).toBe(MESSAGE_ENVOI_ECHOUE)
  })
})

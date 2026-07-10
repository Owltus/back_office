import { describe, expect, it } from 'vitest'

import { errorMessage } from '#/lib/errors.ts'

describe('errorMessage', () => {
  it("lit le message d'une Error", () => {
    expect(errorMessage(new Error('boum'))).toBe('boum')
  })

  it('rend une chaîne telle quelle', () => {
    expect(errorMessage('boum')).toBe('boum')
  })

  /* Le cas qui motive cette fonction : PostgREST renvoie un objet ORDINAIRE,
   * pas une Error. `String(err)` y répondait « [object Object] », et l'écran
   * affichait cette chaîne à l'utilisateur. Erreur réellement observée le
   * 2026-07-10 sur `pms_daily_metrics` (table alors absente). */
  it('lit le message d’un PostgrestError, qui n’est PAS une Error', () => {
    const postgrestError = {
      code: 'PGRST205',
      details: null,
      hint: "Perhaps you meant the table 'public.daily_reports'",
      message: "Could not find the table 'public.pms_daily_metrics'",
    }
    expect(postgrestError instanceof Error).toBe(false)
    expect(String(postgrestError)).toBe('[object Object]')
    expect(errorMessage(postgrestError)).toBe(
      "Could not find the table 'public.pms_daily_metrics'",
    )
  })

  it('ne renvoie jamais une chaîne vide', () => {
    expect(errorMessage(new Error(''))).toBe('erreur inconnue')
    expect(errorMessage({ message: '' })).toBe('erreur inconnue')
    expect(errorMessage('')).toBe('erreur inconnue')
  })

  it('supporte null, undefined et les formes inattendues', () => {
    expect(errorMessage(null)).toBe('erreur inconnue')
    expect(errorMessage(undefined)).toBe('erreur inconnue')
    expect(errorMessage(42)).toBe('erreur inconnue')
    expect(errorMessage({ message: { nested: true } })).toBe('erreur inconnue')
  })
})

import { describe, expect, it, vi } from 'vitest'

import { oublierSession, surOubliSession } from '#/lib/auth/oubliSession.ts'

describe('registre « oublier la session »', () => {
  it('joue chaque réinitialisation inscrite', () => {
    const a = vi.fn()
    const b = vi.fn()
    const retirerA = surOubliSession(a)
    const retirerB = surOubliSession(b)
    oublierSession()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    retirerA()
    retirerB()
  })

  it('une réinitialisation qui jette n’empêche pas les suivantes', () => {
    const avertir = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const casse = vi.fn(() => {
      throw new Error('boum')
    })
    const suivante = vi.fn()
    const r1 = surOubliSession(casse)
    const r2 = surOubliSession(suivante)
    expect(() => oublierSession()).not.toThrow()
    expect(casse).toHaveBeenCalledTimes(1)
    expect(suivante).toHaveBeenCalledTimes(1)
    r1()
    r2()
    avertir.mockRestore()
  })

  it('une réinitialisation désinscrite n’est plus jouée', () => {
    const fn = vi.fn()
    const retirer = surOubliSession(fn)
    retirer()
    oublierSession()
    expect(fn).not.toHaveBeenCalled()
  })

  it('une réinitialisation qui se désinscrit pendant l’oubli ne casse pas la boucle', () => {
    const apres = vi.fn()
    const retirer: { f?: () => void } = {}
    retirer.f = surOubliSession(() => retirer.f?.())
    const r2 = surOubliSession(apres)
    oublierSession()
    expect(apres).toHaveBeenCalledTimes(1)
    r2()
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MESSAGE_MISE_EN_PAGE_EN_COURS,
  MiseEnPageEnCours,
  buildPrintHtml,
} from '#/lib/classeur/print/buildPrintHtml.ts'
import {
  PAGINATION_ATTENTE_MAX_MS,
  attendrePagination,
} from '#/lib/classeur/print/printIframe.ts'
import {
  MERMAID_ATTENTE_MAX_MS,
  waitForMermaid,
} from '#/lib/classeur/print/usePagination.ts'

/*
 * Audit du 2026-10-04 : l'impression ne part jamais avant la fin de la
 * pagination, et aucune attente n'est sans fin (Chrome suspend
 * `requestAnimationFrame` dans un onglet caché).
 */

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function apercu(enCours: boolean): HTMLElement {
  const c = document.createElement('div')
  c.innerHTML = `<div class="a4-page">A</div>${
    enCours ? '<span hidden data-pagination="en-cours"></span>' : ''
  }`
  document.body.appendChild(c)
  return c
}

describe('buildPrintHtml — refuse un aperçu en cours de mesure', () => {
  it('lève MiseEnPageEnCours, message lisible', () => {
    expect(() => buildPrintHtml(apercu(true))).toThrow(MiseEnPageEnCours)
    expect(() => buildPrintHtml(apercu(true))).toThrow(
      "La mise en page n'est pas terminée, réessayez.",
    )
    expect(() => buildPrintHtml(apercu(false))).not.toThrow()
  })
})

describe('attendrePagination', () => {
  it('résout tout de suite sans marqueur', async () => {
    await expect(attendrePagination(apercu(false))).resolves.toBeUndefined()
  })

  it('résout dès que le dernier marqueur disparaît', async () => {
    const c = apercu(true)
    let fini = false
    const p = attendrePagination(c).then(() => {
      fini = true
    })
    await Promise.resolve()
    expect(fini).toBe(false)
    c.querySelector('[data-pagination]')?.remove()
    await p
    expect(fini).toBe(true)
  })

  it('borné : lève MiseEnPageEnCours au bout de 15 s', async () => {
    vi.useFakeTimers()
    expect(PAGINATION_ATTENTE_MAX_MS).toBe(15000)
    const p = attendrePagination(apercu(true))
    const verdict = p.then(
      () => 'résolu',
      (e: unknown) => e,
    )
    await vi.advanceTimersByTimeAsync(14999)
    let fini = false
    void verdict.then(() => {
      fini = true
    })
    await Promise.resolve()
    expect(fini).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const e = await verdict
    expect(e).toBeInstanceOf(MiseEnPageEnCours)
    expect((e as Error).message).toBe(MESSAGE_MISE_EN_PAGE_EN_COURS)
  })
})

describe('waitForMermaid — délai maximal', () => {
  it('sans schéma en attente : résout tout de suite', async () => {
    await expect(
      waitForMermaid(document.createElement('div')),
    ).resolves.toBeUndefined()
  })

  it('schéma qui ne se rend jamais : on continue après 10 s, signalé en console', async () => {
    vi.useFakeTimers()
    const avert = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = document.createElement('div')
    c.innerHTML = '<div data-mermaid-status="pending"></div>'
    document.body.appendChild(c)
    let fini = false
    void waitForMermaid(c).then(() => {
      fini = true
    })
    await vi.advanceTimersByTimeAsync(MERMAID_ATTENTE_MAX_MS - 1)
    expect(fini).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(fini).toBe(true)
    expect(MERMAID_ATTENTE_MAX_MS).toBe(10000)
    expect(avert).toHaveBeenCalledTimes(1)
  })

  it('schéma rendu à temps : résout sans avertir', async () => {
    const avert = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = document.createElement('div')
    c.innerHTML = '<div data-mermaid-status="pending"></div>'
    document.body.appendChild(c)
    const p = waitForMermaid(c)
    c.firstElementChild?.setAttribute('data-mermaid-status', 'rendered')
    await p
    expect(avert).not.toHaveBeenCalled()
  })
})

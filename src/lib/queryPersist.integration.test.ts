// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

import { brancherPersistance } from '#/lib/queryPersist.ts'

/*
 * TEST DE BRANCHEMENT, pas de filtre.
 *
 * `queryPersist.test.ts` vérifie QUI a le droit d'être écrit. Celui-ci vérifie
 * que l'écriture a réellement lieu, dans `localStorage`, et que la
 * restauration remet bien les données dans un client neuf.
 *
 * Pourquoi c'est nécessaire : un filtre juste branché sur rien donne une suite
 * verte et un cache de secours qui n'existe pas. C'est exactement le genre
 * d'illusion que la panne du 2026-09-24 a déjà coûté une fois (un
 * `pg_stat_statements` qui répondait sans rien mesurer).
 */

const CLE = 'bo.query.cache.v1'

function clientNeuf() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 24 * 60 * 60_000, staleTime: 60_000 },
    },
  })
}

describe('brancherPersistance — le cache atteint vraiment le disque', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    window.localStorage.clear()
  })

  it('écrit une lecture réussie et NON sensible dans localStorage', async () => {
    const qc = clientNeuf()
    brancherPersistance(qc)

    await qc.fetchQuery({
      queryKey: ['repjour', 'dashboard', '2026-09-24'],
      queryFn: () => Promise.resolve({ caJour: 4242 }),
    })

    // La persistance est débitée (throttle 2 s) : on laisse passer l'échéance.
    await vi.advanceTimersByTimeAsync(3_000)

    const brut = window.localStorage.getItem(CLE)
    expect(brut).not.toBeNull()
    expect(brut).toContain('4242')
  })

  it('n’écrit PAS une lecture sensible, même réussie', async () => {
    const qc = clientNeuf()
    brancherPersistance(qc)

    await qc.fetchQuery({
      // Noms de clients : ne doivent jamais toucher le disque d'un poste partagé.
      queryKey: ['pdj', 'day', '2026-09-24'],
      queryFn: () => Promise.resolve([{ room: 412, guestName: 'MARTIN' }]),
    })
    await qc.fetchQuery({
      queryKey: ['repjour', 'dashboard', '2026-09-24'],
      queryFn: () => Promise.resolve({ caJour: 4242 }),
    })

    await vi.advanceTimersByTimeAsync(3_000)

    const brut = window.localStorage.getItem(CLE) ?? ''
    // La lecture anodine est là…
    expect(brut).toContain('4242')
    // …et le nom du client n'y est pas.
    expect(brut).not.toContain('MARTIN')
  })

  it('restaure les données dans un client NEUF — le cas d’usage réel', async () => {
    // Premier poste / première session : on remplit et on persiste.
    const premier = clientNeuf()
    brancherPersistance(premier)
    await premier.fetchQuery({
      queryKey: ['repjour', 'dashboard', '2026-09-24'],
      queryFn: () => Promise.resolve({ caJour: 4242 }),
    })
    await vi.advanceTimersByTimeAsync(3_000)

    // Rafraîchissement de page pendant une panne : client neuf, réseau mort.
    const second = clientNeuf()
    brancherPersistance(second)
    await vi.advanceTimersByTimeAsync(0)

    // C'est TOUT l'objet du chantier : l'écran a encore quelque chose à montrer.
    expect(
      second.getQueryData(['repjour', 'dashboard', '2026-09-24']),
    ).toEqual({ caJour: 4242 })
  })

  it('ne fait pas tomber l’application si localStorage refuse', () => {
    // Navigation privée, quota atteint, politique d'entreprise : une panne de
    // cache ne doit jamais empêcher l'app de démarrer.
    const stockage = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
    const qc = clientNeuf()
    expect(() => brancherPersistance(qc)).not.toThrow()
    stockage.mockRestore()
  })
})

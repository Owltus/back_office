// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

import { brancherPersistance, changerDeCompte } from '#/lib/queryPersist.ts'
import { surOubliSession } from '#/lib/auth/oubliSession.ts'

// La base visée, lue par queryPersist au chargement (avant les imports, d'où
// `vi.hoisted`) : depuis le 2026-10-13, seule la session de CETTE base compte
// (`sb-projet-auth-token`), et le cache est marqué `projet:<compte>`.
vi.hoisted(() => {
  import.meta.env.VITE_SUPABASE_URL = 'https://projet.supabase.co'
})

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

const CLE = 'bo.query.cache.v4'

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
    // Un compte connecté, propriétaire du cache (sinon, depuis le
    // 2026-09-28, rien n'est restauré : voir « un cache par compte »).
    window.localStorage.setItem(
      'sb-projet-auth-token',
      JSON.stringify({ user: { id: 'T' } }),
    )
    window.localStorage.setItem('bo.query.cache.proprietaire', 'projet:T')
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

  it('n’écrit PAS une donnée à Set/Map — le bug du 2026-09-25', async () => {
    const qc = clientNeuf()
    brancherPersistance(qc)

    await qc.fetchQuery({
      queryKey: ['rapro', 'day', '2026-09-24'],
      queryFn: () =>
        Promise.resolve({
          reportDate: '2026-09-24',
          statuses: new Map([[101, 'refus']]),
          carriedManual: new Set([102]),
          materialized: new Set<number>(),
        }),
    })
    await qc.fetchQuery({
      queryKey: ['repjour', 'dashboard', '2026-09-24'],
      queryFn: () => Promise.resolve({ caJour: 4242 }),
    })
    await vi.advanceTimersByTimeAsync(3_000)

    const brut = window.localStorage.getItem(CLE)
    expect(brut).not.toBeNull()
    // La lecture saine est bien là ; celle à Set/Map n'y est pas.
    expect(brut).toContain('4242')
    expect(brut).not.toContain('"rapro"')

    // Et un client neuf ne la voit pas : il repartira en réseau, comme avant
    // le cache persisté — au lieu d'itérer un `{}`.
    const second = clientNeuf()
    brancherPersistance(second)
    await vi.advanceTimersByTimeAsync(0)
    expect(second.getQueryData(['rapro', 'day', '2026-09-24'])).toBeUndefined()
    expect(second.getQueryData(['repjour', 'dashboard', '2026-09-24'])).toEqual(
      {
        caJour: 4242,
      },
    )
  })

  it('efface le cache v1 périmé au branchement', () => {
    // Les caches v1 déjà écrits contiennent des Set aplatis : ils ne doivent
    // plus être ni lus (buster) ni laissés sur un poste partagé.
    window.localStorage.setItem('bo.query.cache.v1', '{"buster":"v1"}')
    brancherPersistance(clientNeuf())
    expect(window.localStorage.getItem('bo.query.cache.v1')).toBeNull()
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
    expect(second.getQueryData(['repjour', 'dashboard', '2026-09-24'])).toEqual(
      { caJour: 4242 },
    )
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

describe('un cache par compte (poste partagé, 2026-09-28)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    window.localStorage.clear()
  })

  const session = (id: string) =>
    window.localStorage.setItem(
      'sb-projet-auth-token',
      JSON.stringify({ user: { id } }),
    )

  async function ecrirePour(id: string) {
    session(id)
    const qc = clientNeuf()
    brancherPersistance(qc)
    changerDeCompte(id)
    await qc.fetchQuery({
      queryKey: ['classeur', 'items', 5],
      queryFn: () => Promise.resolve({ secret: 'de-' + id }),
    })
    await vi.advanceTimersByTimeAsync(3_000)
    return qc
  }

  it('le même compte retrouve son cache au démarrage suivant', async () => {
    await ecrirePour('A')
    const suivant = clientNeuf()
    brancherPersistance(suivant)
    await vi.advanceTimersByTimeAsync(0)
    expect(suivant.getQueryData(['classeur', 'items', 5])).toEqual({
      secret: 'de-A',
    })
  })

  it('un AUTRE compte sur le même poste ne voit rien de A, même un instant', async () => {
    await ecrirePour('A')
    session('B')
    const suivant = clientNeuf()
    brancherPersistance(suivant)
    await vi.advanceTimersByTimeAsync(0)
    expect(suivant.getQueryData(['classeur', 'items', 5])).toBeUndefined()
    expect(window.localStorage.getItem(CLE) ?? '').not.toContain('de-A')
  })

  it('changement de compte en cours de session : mémoire et disque vidés', async () => {
    const qc = await ecrirePour('A')
    changerDeCompte('B')
    expect(qc.getQueryData(['classeur', 'items', 5])).toBeUndefined()
    expect(window.localStorage.getItem(CLE)).toBeNull()
  })

  it('déconnexion : tout est vidé ; même compte : rien n’est vidé', async () => {
    const qc = await ecrirePour('A')
    changerDeCompte('A')
    expect(qc.getQueryData(['classeur', 'items', 5])).toBeDefined()
    changerDeCompte(null)
    expect(qc.getQueryData(['classeur', 'items', 5])).toBeUndefined()
    expect(window.localStorage.getItem(CLE)).toBeNull()
  })
})

describe('mémoire de l’onglet liée à son compte (audit du 2026-11-18)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    window.localStorage.clear()
  })

  const MARQUE = 'bo.query.cache.proprietaire'
  const session = (id: string) =>
    window.localStorage.setItem(
      'sb-projet-auth-token',
      JSON.stringify({ user: { id } }),
    )

  async function ecrirePour(id: string) {
    session(id)
    const qc = clientNeuf()
    brancherPersistance(qc)
    changerDeCompte(id)
    await qc.fetchQuery({
      queryKey: ['classeur', 'items', 5],
      queryFn: () => Promise.resolve({ secret: 'de-' + id }),
    })
    await vi.advanceTimersByTimeAsync(3_000)
    return qc
  }

  function evenementStockage(key: string | null, newValue: string | null) {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key,
        newValue,
        storageArea: window.localStorage,
      }),
    )
  }

  it('un autre onglet a écrit la marque de B avant moi : ma mémoire de A est vidée', async () => {
    const qc = await ecrirePour('A')
    // L'autre onglet : B se connecte et marque le disque AVANT que cet
    // onglet ne reçoive l'événement d'auth.
    session('B')
    window.localStorage.setItem(MARQUE, 'projet:B')
    changerDeCompte('B')
    expect(qc.getQueryData(['classeur', 'items', 5])).toBeUndefined()
    expect(window.localStorage.getItem(MARQUE)).toBe('projet:B')
  })

  it('même compte au démarrage : le cache restauré reste (lecture en panne)', async () => {
    await ecrirePour('A')
    const suivant = clientNeuf()
    brancherPersistance(suivant)
    await vi.advanceTimersByTimeAsync(0)
    // Session initiale, TOKEN_REFRESHED, SIGNED_IN rejoué : même compte.
    changerDeCompte('A')
    changerDeCompte('A')
    expect(suivant.getQueryData(['classeur', 'items', 5])).toEqual({
      secret: 'de-A',
    })
    expect(window.localStorage.getItem(CLE) ?? '').toContain('de-A')
  })

  it('l’événement storage d’un autre compte vide la mémoire', async () => {
    const qc = await ecrirePour('A')
    window.localStorage.setItem(MARQUE, 'projet:B')
    evenementStockage(MARQUE, 'projet:B')
    expect(qc.getQueryData(['classeur', 'items', 5])).toBeUndefined()
  })

  it('l’événement storage de MA marque, ou d’une autre clé, ne vide rien', async () => {
    const qc = await ecrirePour('A')
    evenementStockage(MARQUE, 'projet:A')
    evenementStockage('autre.cle', null)
    expect(qc.getQueryData(['classeur', 'items', 5])).toBeDefined()
  })

  it('marque retirée ou stockage vidé dans un autre onglet : mémoire vidée', async () => {
    const qc = await ecrirePour('A')
    evenementStockage(MARQUE, null)
    expect(qc.getQueryData(['classeur', 'items', 5])).toBeUndefined()

    const qc2 = await ecrirePour('A')
    evenementStockage(null, null)
    expect(qc2.getQueryData(['classeur', 'items', 5])).toBeUndefined()
  })

  it('changerDeCompte(null) et vers B oublient la session, pas le même compte', async () => {
    await ecrirePour('A')
    const oubli = vi.fn()
    const retirer = surOubliSession(oubli)
    try {
      changerDeCompte('A')
      expect(oubli).not.toHaveBeenCalled()
      changerDeCompte('B')
      expect(oubli).toHaveBeenCalledTimes(1)
      changerDeCompte(null)
      expect(oubli).toHaveBeenCalledTimes(2)
    } finally {
      retirer()
    }
  })

  it('stockage indisponible : un changement de compte vide quand même la mémoire', async () => {
    const qc = await ecrirePour('A')
    // Sur le PROTOTYPE : sous jsdom, poser une méthode sur l'instance de
    // `Storage` écrit une entrée nommée « getItem » au lieu de l'espionner.
    const lecture = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError')
      })
    try {
      changerDeCompte('A')
      expect(qc.getQueryData(['classeur', 'items', 5])).toBeDefined()
      changerDeCompte('B')
      expect(qc.getQueryData(['classeur', 'items', 5])).toBeUndefined()
    } finally {
      lecture.mockRestore()
    }
  })
})

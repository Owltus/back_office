import { describe, expect, it, vi } from 'vitest'

// Le module du routeur importe l'arbre des routes et des composants : seule la
// décision pure est testée ici, le reste est neutralisé.
vi.mock('./routeTree.gen', () => ({ routeTree: {} }))
vi.mock('./lib/query.ts', () => ({ getContext: () => ({}) }))
vi.mock('#/components/shared/NotFound.tsx', () => ({ NotFound: () => null }))
vi.mock('#/components/shared/RouteError.tsx', () => ({
  RouteError: () => null,
}))
vi.mock('#/components/shared/skeleton/RouteSkeleton.tsx', () => ({
  PendingRoute: () => null,
}))

const { doitRechargerSurChunkPerdu } = await import('./router.tsx')

const BASE = {
  navigationEnCours: true,
  enLigne: true,
  maintenant: 1_000_000,
  dernierRechargement: 0,
}

describe('doitRechargerSurChunkPerdu', () => {
  it('recharge pendant une navigation, en ligne, sans rechargement récent', () => {
    expect(doitRechargerSurChunkPerdu(BASE)).toBe(true)
  })

  it('ne recharge pas sur un préchargement au survol ou un import() hors navigation', () => {
    expect(
      doitRechargerSurChunkPerdu({ ...BASE, navigationEnCours: false }),
    ).toBe(false)
  })

  it('ne recharge pas hors ligne', () => {
    expect(doitRechargerSurChunkPerdu({ ...BASE, enLigne: false })).toBe(false)
  })

  it('anti-boucle : pas de second rechargement dans la minute', () => {
    expect(
      doitRechargerSurChunkPerdu({
        ...BASE,
        dernierRechargement: BASE.maintenant - 59_999,
      }),
    ).toBe(false)
    expect(
      doitRechargerSurChunkPerdu({
        ...BASE,
        dernierRechargement: BASE.maintenant - 60_000,
      }),
    ).toBe(true)
  })
})

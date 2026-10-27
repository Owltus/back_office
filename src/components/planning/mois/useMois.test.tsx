// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'

import type * as ModPlanning from '#/components/planning/hooks/usePlanning.ts'
import type * as ModSemaine from '#/lib/planning/semaine.ts'
import type { DonneesSemaine } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'

/*
 * Horaires fixes de la vue mois (prototype `poser_fixes`). Oracles : une
 * semaine à venir d'avant le dernier planning réalisé reçoit ses fixes (seuls
 * le passé et le verrou arrêtent la pose) ; une fiche à jours fixes modifiée
 * relance la pose une fois.
 */

const generer = vi.hoisted(() => vi.fn(() => Promise.resolve({})))

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/components/auth/AuthContext.tsx', () => ({ useAuth: () => ({}) }))
vi.mock('#/lib/planning/semaine.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof ModSemaine>()),
  aPoserFixes: () => new Set([3]),
}))
vi.mock(
  '#/components/planning/hooks/usePlanning.ts',
  async (importOriginal) => ({
    ...(await importOriginal<typeof ModPlanning>()),
    useGenerer: () => generer,
  }),
)

const { usePoserFixesMois } =
  await import('#/components/planning/mois/useMois.ts')

const { referentiel } = hotelDemo('2026-11-09')
const AUJOURDHUI = '2026-11-04'
const LUNDIS = ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']
// Dernier planning réalisé : le 16/11 ; le 09/11, avant lui, reste ouvert.
const VERROUS = ['2026-11-16']

const carte = (salaries = referentiel.salaries) =>
  new Map(
    LUNDIS.map((l) => [
      l,
      {
        lundi: l,
        referentiel: { ...referentiel, salaries },
      } as unknown as DonneesSemaine,
    ]),
  )

function enveloppe({ children }: { children: ReactNode }) {
  const qc = new QueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('usePoserFixesMois', () => {
  it('pose sur toute semaine à venir non verrouillée, même avant le réalisé', async () => {
    const { rerender } = renderHook(
      ({ donnees }: { donnees: Map<string, DonneesSemaine> }) =>
        usePoserFixesMois({
          donnees,
          verrous: VERROUS,
          ecrire: true,
          aujourdhui: AUJOURDHUI,
          pendant: (f) => f(),
          surMessage: vi.fn(),
        }),
      { wrapper: enveloppe, initialProps: { donnees: carte() } },
    )
    await waitFor(() => expect(generer).toHaveBeenCalledTimes(2))
    // Passée (26/10) et verrouillée (16/11) sautées ; 02/11 et 09/11 posées.
    expect(generer.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      '2026-11-02',
      '2026-11-09',
    ])

    // Une fiche à jours fixes change : une nouvelle tentative par semaine.
    const i = referentiel.salaries.findIndex((x) =>
      x.semaine_type.some((e) => e.mode === 'travail' || e.mode === 'repos'),
    )
    rerender({
      donnees: carte(
        referentiel.salaries.map((x, k) =>
          k === i ? { ...x, date_sortie: '2027-12-31' } : x,
        ),
      ),
    })
    await waitFor(() => expect(generer).toHaveBeenCalledTimes(4))
    // Mêmes fiches : plus rien.
    rerender({
      donnees: carte(
        referentiel.salaries.map((x, k) =>
          k === i ? { ...x, date_sortie: '2027-12-31' } : x,
        ),
      ),
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(generer).toHaveBeenCalledTimes(4)
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'
import type * as ModPlanning from '#/components/planning/hooks/usePlanning.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import type { Referentiel } from '#/lib/planning/types.ts'

/*
 * Menu des paramètres (étape 7) : ordre de réglage Horaires, Postes, Équipe,
 * Besoins, numéroté, coche sur un écran sans point bloquant.
 */

const etat = vi.hoisted(() => ({ referentiel: null as unknown }))

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/components/planning/ImportPrototypeDialog.tsx', () => ({
  ImportPrototypeDialog: () => null,
}))
vi.mock(
  '#/components/planning/hooks/usePlanning.ts',
  async (importOriginal) => ({
    ...(await importOriginal<typeof ModPlanning>()),
    useDroitsPlanning: () => ({
      pret: true,
      lire: true,
      ecrire: true,
      gerer: false,
    }),
    useAujourdhui: () => '2026-10-27',
    useReferentiel: () => ({ data: etat.referentiel }),
  }),
)

const { MenuParametres, PARAMETRES } =
  await import('#/components/planning/EnTeteParametres.tsx')

afterEach(cleanup)

function ouvrir() {
  render(
    <TooltipProvider>
      <MenuParametres />
    </TooltipProvider>,
  )
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Paramètres' }), {
    button: 0,
    pointerType: 'mouse',
  })
  return screen.getAllByRole('menuitem').map((e) => e.textContent)
}

describe('MenuParametres', () => {
  it('suit l’ordre de réglage', () => {
    expect(PARAMETRES.map((p) => p.ecran)).toEqual([
      'horaires',
      'postes',
      'equipe',
      'besoins',
    ])
  })

  it('numérote et coche les écrans réglés', () => {
    const demo = hotelDemo('2026-11-02').referentiel
    // Des horaires et des postes, mais aucun besoin.
    etat.referentiel = { ...demo, besoins: [] } satisfies Referentiel
    expect(ouvrir()).toEqual([
      '1Horaires et absences, réglé',
      '2Postes, réglé',
      '3Équipe, réglé',
      '4Besoins',
    ])
  })

  it('référentiel vide : rien n’est coché', () => {
    etat.referentiel = {
      ...hotelDemo('2026-11-02').referentiel,
      horaires: [],
      postes: [],
      salaries: [],
      besoins: [],
    } satisfies Referentiel
    expect(ouvrir()).toEqual([
      '1Horaires et absences',
      '2Postes',
      '3Équipe',
      '4Besoins',
    ])
  })
})

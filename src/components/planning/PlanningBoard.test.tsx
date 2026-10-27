// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

/*
 * Période ouverte par défaut (prototype `PlanningPage`) : le mois EN COURS
 * pour la vue mois, la semaine prochaine pour la vue semaine.
 */

const AUJOURDHUI = vi.hoisted(() => ({ jour: '2026-10-28' }))

vi.mock('#/components/planning/hooks/usePlanning.ts', () => ({
  useAujourdhui: () => AUJOURDHUI.jour,
}))
vi.mock('#/components/planning/mois/VueMois.tsx', () => ({
  VueMois: ({ mois }: { mois: string }) => <p>mois {mois}</p>,
}))
vi.mock('#/components/planning/semaine/VueSemaine.tsx', () => ({
  VueSemaine: ({ lundi }: { lundi: string }) => <p>semaine {lundi}</p>,
}))

const { PlanningBoard, moisParDefaut } =
  await import('#/components/planning/PlanningBoard.tsx')

afterEach(cleanup)

describe('PlanningBoard', () => {
  it('ouvre le mois en cours, même en fin de mois', () => {
    // Le jeudi de la semaine prochaine tombe en novembre : on reste en octobre.
    render(<PlanningBoard search={{}} onSearch={vi.fn()} />)
    expect(screen.getByText('mois 2026-10')).toBeTruthy()
    expect(moisParDefaut('2026-12-31')).toBe('2026-12')
  })

  it('la vue semaine ouvre toujours la semaine prochaine', () => {
    render(<PlanningBoard search={{ vue: 'semaine' }} onSearch={vi.fn()} />)
    expect(screen.getByText('semaine 2026-11-02')).toBeTruthy()
  })
})

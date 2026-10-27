// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'
import { analyser } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import {
  DESARMEMENT_MS,
  EditeurShift,
  dateEnLettres,
} from '#/components/planning/semaine/EditeurShift.tsx'

/*
 * Éditeur d'un shift, seul. Oracles : la suppression en deux temps se
 * désarme au bout de 4 s sans confirmation ; la vue mois y lit la date en
 * toutes lettres, la vue semaine le jour de la semaine.
 */

const LUNDI = '2026-11-02'
const { referentiel, absences } = hotelDemo(LUNDI)
const SHIFT = analyser({
  lundi: LUNDI,
  referentiel,
  absences,
  affectations: [
    {
      id: 7,
      lundi: LUNDI,
      salarie_id: 3,
      poste_id: 2,
      jour: 2,
      horaire_id: 1,
      debut: '07:00',
      fin: '15:45',
      epinglee: true,
      court: false,
      pause: 45,
    },
  ],
  avant: [],
  apres: [],
}).affectations[0]

function rendre(enLettres = false) {
  const onSupprimer = vi.fn()
  render(
    <TooltipProvider>
      <EditeurShift
        edition={{ mode: 'modification', shift: SHIFT }}
        lundi={LUNDI}
        referentiel={referentiel}
        absence={null}
        dateEnLettres={enLettres}
        onFermer={vi.fn()}
        onCreer={vi.fn()}
        onModifier={vi.fn()}
        onSupprimer={onSupprimer}
        onPoserAbsence={vi.fn()}
        onRetirerAbsence={vi.fn()}
      />
    </TooltipProvider>,
  )
  return { onSupprimer }
}

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {}
  Element.prototype.hasPointerCapture = () => false
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('EditeurShift', () => {
  it('la suppression en deux temps se désarme après 4 s', () => {
    vi.useFakeTimers()
    const { onSupprimer } = rendre()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(
      screen.getByRole('button', { name: 'Confirmer la suppression' }),
    ).toBeTruthy()
    act(() => vi.advanceTimersByTime(DESARMEMENT_MS - 100))
    expect(
      screen.getByRole('button', { name: 'Confirmer la suppression' }),
    ).toBeTruthy()
    act(() => vi.advanceTimersByTime(200))
    expect(
      screen.queryByRole('button', { name: 'Confirmer la suppression' }),
    ).toBeNull()
    expect(onSupprimer).not.toHaveBeenCalled()
    // Réarmée, elle supprime.
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmer la suppression' }),
    )
    expect(onSupprimer).toHaveBeenCalledWith(7)
  })

  it('date en toutes lettres (vue mois) ou jour de la semaine (vue semaine)', () => {
    rendre(true)
    expect(screen.getByText(/mercredi 4 novembre 2026/)).toBeTruthy()
    cleanup()
    rendre(false)
    expect(screen.queryByText(/novembre/)).toBeNull()
    expect(screen.getByText(/· Mercredi/)).toBeTruthy()
    expect(dateEnLettres('2026-11-18')).toBe('mercredi 18 novembre 2026')
  })
})

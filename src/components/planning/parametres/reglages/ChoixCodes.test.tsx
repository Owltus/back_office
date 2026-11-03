// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { ChoixCodes } from '#/components/planning/parametres/reglages/ChoixCodes.tsx'
import type { Horaire } from '#/lib/planning/types.ts'

afterEach(cleanup)

const horaire = (h: Omit<Horaire, 'nom' | 'couleur'>): Horaire => ({
  ...h,
  nom: `${h.debut}-${h.fin}`,
  couleur: '#888888',
})

describe('ChoixCodes', () => {
  it('chaque horaire montre son travail pur, pause déduite (2026-11-03)', () => {
    render(
      <ChoixCodes
        etiquette="Horaires possibles"
        horaires={[
          horaire({
            id: 1,
            debut: '07:00',
            fin: '15:45',
            pause: 45,
            periode: 'matin',
          }),
          horaire({
            id: 2,
            debut: '23:00',
            fin: '07:00',
            pause: 0,
            periode: 'nuit',
          }),
          horaire({
            id: 3,
            debut: '07:00',
            fin: '14:45',
            pause: 45,
            periode: 'matin',
          }),
        ]}
        choisis={[1]}
        onChange={() => {}}
      />,
    )
    const texte = (debut: RegExp) =>
      screen.getByRole('button', { name: debut }).textContent
    // 8 h 45 de présence moins 45 min de pause.
    expect(texte(/^07:00–15:45/)).toContain('(8h)')
    // Une nuit sans pause : toute la présence.
    expect(texte(/^23:00–07:00/)).toContain('(8h)')
    // 7 h 45 de présence moins 45 min.
    expect(texte(/^07:00–14:45/)).toContain('(7h)')
  })
})

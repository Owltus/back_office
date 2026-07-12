import { describe, expect, it } from 'vitest'

import { matchRoom } from '#/lib/parking/pdjMatch.ts'

const rows = [
  { room: 101, guest_name: 'DURAND, Jean' },
  { room: 205, guest_name: 'MARTIN, Sophie' },
  { room: 312, guest_name: 'VAN DER BERGHE, Luc' },
]

describe('matchRoom', () => {
  it('nom de famille seul → chambre', () => {
    expect(matchRoom('Durand', rows)).toBe(101)
  })

  it('accents et casse ignorés', () => {
    expect(matchRoom('durànd', rows)).toBe(101)
  })

  it('prénom + nom dans un ordre quelconque', () => {
    expect(matchRoom('Jean Durand', rows)).toBe(101)
    expect(matchRoom('Sophie Martin', rows)).toBe(205)
  })

  it('nom composé', () => {
    expect(matchRoom('Van Der Berghe', rows)).toBe(312)
  })

  it('aucune correspondance → null', () => {
    expect(matchRoom('Petit', rows)).toBeNull()
    expect(matchRoom('', rows)).toBeNull()
  })

  it('nom purgé (RGPD, guest_name null) → ignoré', () => {
    expect(matchRoom('Durand', [{ room: 101, guest_name: null }])).toBeNull()
  })

  it('ambiguïté (deux chambres pour le même nom) → null', () => {
    const dup = [
      { room: 101, guest_name: 'DURAND, Jean' },
      { room: 150, guest_name: 'DURAND, Paul' },
    ]
    expect(matchRoom('Durand', dup)).toBeNull()
  })
})

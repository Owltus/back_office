// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FenetreCalcul } from '#/components/planning/FenetreCalcul.tsx'

afterEach(cleanup)

describe('FenetreCalcul (demande utilisateur du 2026-11-03)', () => {
  let t = 0
  const horloge = () => t
  beforeEach(() => {
    t = 0
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  const mois = {
    titre: 'Compléter le mois',
    i: 2,
    n: 5,
    lundi: '2026-11-09',
  }

  it('fermée sans calcul', () => {
    render(<FenetreCalcul calcul={null} onArreter={() => {}} />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('montre les semaines faites, sans texte de date ni de temps', () => {
    render(
      <FenetreCalcul calcul={mois} onArreter={() => {}} maintenant={horloge} />,
    )
    const fenetre = screen.getByRole('alertdialog', {
      name: 'Compléter le mois',
    })
    // Refusé (2026-11-03) : ni semaine, ni date, ni temps, ni consigne.
    for (const mot of ['Semaine', 'novembre', 'min au plus', 'proposition'])
      expect(fenetre.textContent).not.toContain(mot)
    const barre = screen.getByRole('progressbar')
    expect(barre.getAttribute('aria-valuenow')).toBe('1')
    expect(barre.getAttribute('aria-valuemax')).toBe('5')
    const etats = [...barre.children].map((e) => e.getAttribute('data-etat'))
    expect(etats).toEqual([
      'faite',
      'en-cours',
      'a-faire',
      'a-faire',
      'a-faire',
    ])
  })

  it('la semaine en cours se remplit avec le temps, et repart à zéro', () => {
    const { rerender } = render(
      <FenetreCalcul calcul={mois} onArreter={() => {}} maintenant={horloge} />,
    )
    const rempli = () =>
      (document.querySelector('.planning-calcul-temps') as HTMLElement).style
        .width
    act(() => {
      t = 30_000
      vi.advanceTimersByTime(500)
    })
    expect(rempli()).toBe('50%')
    rerender(
      <FenetreCalcul
        calcul={{ ...mois, i: 3, lundi: '2026-11-16' }}
        onArreter={() => {}}
        maintenant={horloge}
      />,
    )
    expect(rempli()).toBe('0%')
  })

  it('au-delà d’une minute, dit que le calcul continue', () => {
    render(
      <FenetreCalcul calcul={mois} onArreter={() => {}} maintenant={horloge} />,
    )
    expect(screen.queryByRole('status')).toBeNull()
    act(() => {
      t = 75_000
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByRole('status').textContent).toMatch(/continue/)
  })

  it('avec l’horloge par défaut, la barre avance aussi', () => {
    // Une horloge neuve à chaque rendu remettait le compte à zéro.
    vi.setSystemTime(0)
    render(<FenetreCalcul calcul={mois} onArreter={() => {}} />)
    act(() => {
      vi.advanceTimersByTime(6_000)
    })
    expect(
      (document.querySelector('.planning-calcul-temps') as HTMLElement).style
        .width,
    ).toBe('10%')
  })

  it('Arrêter le calcul appelle l’arrêt une fois, puis attend', () => {
    const onArreter = vi.fn()
    render(
      <FenetreCalcul
        calcul={mois}
        onArreter={onArreter}
        maintenant={horloge}
      />,
    )
    const bouton = screen.getByRole('button', { name: 'Arrêter le calcul' })
    expect(document.activeElement).toBe(bouton)
    fireEvent.click(bouton)
    fireEvent.click(bouton)
    expect(onArreter).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('button', { name: 'Arrêt en cours…' }),
    ).toHaveProperty('disabled', true)
  })

  it('Échap ne ferme pas la fenêtre', () => {
    const onArreter = vi.fn()
    render(
      <FenetreCalcul
        calcul={mois}
        onArreter={onArreter}
        maintenant={horloge}
      />,
    )
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(onArreter).not.toHaveBeenCalled()
  })
})

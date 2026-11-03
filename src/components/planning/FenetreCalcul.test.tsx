// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FenetreCalcul,
  duree,
  periodeSemaine,
} from '#/components/planning/FenetreCalcul.tsx'

afterEach(cleanup)

describe('periodeSemaine / duree', () => {
  it('dit la semaine en clair, même à cheval sur deux mois', () => {
    expect(periodeSemaine('2026-11-09')).toBe('du 9 au 15 novembre')
    expect(periodeSemaine('2026-11-30')).toBe('du 30 novembre au 6 décembre')
    expect(periodeSemaine('2026-12-28')).toBe('du 28 décembre au 3 janvier')
  })
  it('écrit le temps en minutes et secondes', () => {
    expect(duree(0)).toBe('0:00')
    expect(duree(7.9)).toBe('0:07')
    expect(duree(72)).toBe('1:12')
  })
})

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

  it('montre la semaine, le compteur et les semaines faites', () => {
    render(
      <FenetreCalcul calcul={mois} onArreter={() => {}} maintenant={horloge} />,
    )
    const fenetre = screen.getByRole('alertdialog')
    expect(fenetre.textContent).toContain('Compléter le mois')
    expect(fenetre.textContent).toContain(
      'Semaine 2 sur 5 · du 9 au 15 novembre',
    )
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
    expect(fenetre.textContent).toContain('Les semaines finies restent')
  })

  it('le temps de la semaine avance, et repart à zéro à la suivante', () => {
    const { rerender } = render(
      <FenetreCalcul calcul={mois} onArreter={() => {}} maintenant={horloge} />,
    )
    act(() => {
      t = 14_000
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByRole('alertdialog').textContent).toContain('0:14')
    rerender(
      <FenetreCalcul
        calcul={{ ...mois, i: 3, lundi: '2026-11-16' }}
        onArreter={() => {}}
        maintenant={horloge}
      />,
    )
    expect(screen.getByRole('alertdialog').textContent).toContain('0:00')
  })

  it('avec l’horloge par défaut, le temps avance aussi', () => {
    // Une horloge neuve à chaque rendu remettait le compte à 0:00.
    vi.setSystemTime(0)
    render(<FenetreCalcul calcul={mois} onArreter={() => {}} />)
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(screen.getByRole('alertdialog').textContent).toContain('0:03')
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

  it('une seule semaine : pas de compteur sur plusieurs', () => {
    render(
      <FenetreCalcul
        calcul={{
          titre: 'Compléter la semaine',
          i: 1,
          n: 1,
          lundi: '2026-11-09',
        }}
        onArreter={() => {}}
        maintenant={horloge}
      />,
    )
    const texte = screen.getByRole('alertdialog').textContent
    expect(texte).toContain('Semaine du 9 au 15 novembre')
    expect(texte).not.toContain('sur 1')
    expect(texte).toContain('Le planning reste en proposition')
  })
})

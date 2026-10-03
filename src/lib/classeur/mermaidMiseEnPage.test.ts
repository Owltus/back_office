import { describe, expect, it } from 'vitest'

import {
  affichageSchema,
  coupesSchema,
  echelleSurPage,
  orientationAlternative,
  tailleNaturelle,
} from '#/lib/classeur/mermaidMiseEnPage.ts'

describe('mise en page des schémas Mermaid', () => {
  it('lit la taille naturelle dans le viewBox', () => {
    expect(tailleNaturelle('<svg viewBox="0 0 640.5 220" x="1">')).toEqual({
      largeur: 640.5,
      hauteur: 220,
    })
    expect(tailleNaturelle('<svg>')).toBeNull()
  })

  it('tient dans la colonne et dans une page, jamais agrandi', () => {
    expect(echelleSurPage({ largeur: 300, hauteur: 200 })).toBe(1)
    expect(echelleSurPage({ largeur: 1436, hauteur: 200 })).toBeCloseTo(0.5)
    expect(echelleSurPage({ largeur: 400, hauteur: 1550 })).toBeCloseTo(0.5)
  })

  it('inverse le sens d’un organigramme, rien d’autre', () => {
    expect(orientationAlternative('flowchart LR\n  A --> B')).toBe(
      'flowchart TD\n  A --> B',
    )
    expect(orientationAlternative('graph TD\nA-->B')).toBe('graph LR\nA-->B')
    expect(orientationAlternative('%% note\nflowchart TB\nA-->B')).toBe(
      '%% note\nflowchart LR\nA-->B',
    )
    expect(orientationAlternative('sequenceDiagram\nA->>B: x')).toBeNull()
  })

  it('découpe un schéma très haut mais lisible en largeur', () => {
    expect(affichageSchema({ largeur: 620, hauteur: 3560 })).toBe('decoupe')
    // Très large : la page ne l'écrase pas plus que la largeur, pas de coupe.
    expect(affichageSchema({ largeur: 2000, hauteur: 300 })).toBe('page')
    expect(affichageSchema({ largeur: 500, hauteur: 600 })).toBe('page')
  })

  it('coupe entre deux cases, jamais au milieu', () => {
    // Cases de 40 px tous les 60 px : [0,40], [60,100], [120,160]…
    const bandes = Array.from(
      { length: 20 },
      (_, i) => [i * 60, i * 60 + 40] as const,
    )
    const coupes = coupesSchema(1200, bandes, 250, 300)
    expect(coupes.length).toBeGreaterThan(2)
    for (const y of coupes) {
      expect(bandes.some(([h, b]) => h < y && b > y)).toBe(false)
    }
    // Chaque morceau tient dans sa place.
    let depart = 0
    coupes.forEach((y, i) => {
      expect(y - depart).toBeLessThanOrEqual(i === 0 ? 250 : 300)
      depart = y
    })
  })

  it('une case plus haute que la place : coupe sous elle, sans boucler', () => {
    expect(coupesSchema(500, [[10, 400]], 100, 100)).toEqual([10, 400])
  })
})

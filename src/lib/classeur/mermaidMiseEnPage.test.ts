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

  it('la coupe tombe au milieu du plus grand espace vide du bas de la place', () => {
    const bandes = [
      [0, 50],
      [55, 100],
      [100, 190],
      [230, 240],
      [250, 400],
    ] as const
    // Place 250 : dernier quart = [187,5 ; 250] ; plus grand vide [190, 230].
    expect(coupesSchema(400, bandes, 250, 400)[0]).toBe(210)
  })
  it('une case plus haute que la place : coupe sous elle, sans boucler', () => {
    // Aucune tranche plus haute que la place, même en coupant la case.
    const coupes = coupesSchema(500, [[10, 400]], 100, 100)
    const bornes = [0, ...coupes, 500]
    for (let i = 1; i < bornes.length; i++)
      expect(bornes[i] - bornes[i - 1]).toBeLessThanOrEqual(100)
  })
})

describe('pas de queue de schéma', () => {
  it('le dernier morceau n’est jamais minuscule : les deux derniers se partagent', () => {
    // 610 px sur des pages de 300 : 300 + 300 + 10 sans la règle.
    const coupes = coupesSchema(610, [], 300, 300)
    const bornes = [0, ...coupes, 610]
    const morceaux = bornes.slice(1).map((b, i) => b - bornes[i])
    expect(Math.min(...morceaux)).toBeGreaterThanOrEqual(75)
    expect(Math.max(...morceaux)).toBeLessThanOrEqual(300)
  })
})

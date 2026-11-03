// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  PastillesPresence,
  PointsPresence,
} from '#/components/planning/semaine/Presence.tsx'
import { TooltipProvider } from '#/components/ui/tooltip.tsx'

const rendre = (n: React.ReactNode) =>
  render(<TooltipProvider>{n}</TooltipProvider>)

/*
 * Points de présence de la vue mois (décision utilisateur du 2026-10-31) :
 * toujours trois points, matin, soir, nuit ; vert conforme, rouge il manque
 * du monde, bleu plus que le maximum ; rond vide sans minimum réglé.
 */

afterEach(cleanup)

const points = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>('[data-periode]')].map((e) => ({
    periode: e.dataset.periode,
    classe: e.getAttribute('class') ?? '',
    plein: e.firstElementChild?.getAttribute('fill') === 'currentColor',
    forme: e.firstElementChild?.tagName,
  }))

describe('PointsPresence', () => {
  it('trois points, colorés selon l’écart, la nuit vide sans minimum', () => {
    const { container } = rendre(
      <PointsPresence
        presence={[
          {
            jour: 0,
            periode: 'matin',
            compte: 2,
            minimum: 3,
            maximum: 4,
            ecart: -1,
          },
          {
            jour: 0,
            periode: 'soir',
            compte: 3,
            minimum: 2,
            maximum: 3,
            ecart: 0,
          },
        ]}
      />,
    )
    const p = points(container)
    expect(p.map((x) => x.periode)).toEqual(['matin', 'soir', 'nuit'])
    expect(p[0].classe).toContain('text-red-500')
    expect(p[0].plein).toBe(true)
    expect(p[1].classe).toContain('text-emerald-500')
    // Rond le jour, triangle la nuit (2026-11-03).
    expect(p.map((x) => x.forme)).toEqual(['circle', 'circle', 'path'])
    // La nuit sans minimum : orange et juste dessinée.
    expect(p[2].classe).toContain('text-amber-500')
    expect(p[2].plein).toBe(false)
    expect(
      container.querySelector('[aria-label]')?.getAttribute('aria-label'),
    ).toContain("Nuit : personne de demandé, l'hôtel peut rester vide")
  })

  it('bleu au-delà du maximum ; rien tant que la semaine n’est pas lue', () => {
    const { container } = rendre(
      <PointsPresence
        presence={[
          {
            jour: 0,
            periode: 'nuit',
            compte: 2,
            minimum: 1,
            maximum: 1,
            ecart: 1,
          },
        ]}
      />,
    )
    expect(points(container)[2].classe).toContain('text-sky-500')
    cleanup()
    const vide = rendre(<PointsPresence presence={undefined} />)
    expect(points(vide.container)).toEqual([])
  })
})

describe('PastillesPresence (audit RH du 2026-11-01)', () => {
  it('un moment sans personne demandée a sa pastille orange', () => {
    const { container } = rendre(
      <PastillesPresence
        presence={[
          {
            jour: 0,
            periode: 'matin',
            compte: 2,
            minimum: 2,
            maximum: 2,
            ecart: 0,
          },
          {
            jour: 0,
            periode: 'soir',
            compte: 2,
            minimum: 2,
            maximum: 2,
            ecart: 0,
          },
        ]}
      />,
    )
    const noms = [...container.querySelectorAll('[aria-label]')].map((x) =>
      x.getAttribute('aria-label'),
    )
    expect(noms).toContain(
      "Nuit : personne de demandé, l'hôtel peut rester vide",
    )
    // Refusé : les trois moments demandés, aucune pastille vide.
    const plein = rendre(
      <PastillesPresence
        presence={(['matin', 'soir', 'nuit'] as const).map((periode) => ({
          jour: 0,
          periode,
          compte: 1,
          minimum: 1,
          maximum: 1,
          ecart: 0,
        }))}
      />,
    )
    expect(plein.container.textContent).not.toContain('–')
  })
})

describe('PointsPresence : les transmissions (2026-11-02)', () => {
  const presence = (['matin', 'soir', 'nuit'] as const).map((periode) => ({
    jour: 0,
    periode,
    compte: 1,
    minimum: 1,
    maximum: 1,
    ecart: 0,
  }))
  const liens = (c: HTMLElement) =>
    [...c.querySelectorAll<HTMLElement>('[data-transmission]')].map((e) => ({
      etat: e.dataset.transmission,
      classe: e.className,
    }))
  const periodes = (c: HTMLElement) =>
    [...c.querySelectorAll<HTMLElement>('[data-periode]')].map(
      (e) => e.dataset.periode,
    )
  const classe = (c: HTMLElement, periode: string) =>
    c.querySelector(`[data-periode="${periode}"]`)!.getAttribute('class')!

  it('un trait par transmission ; les deux ronds centrés, reliés par un trait court', () => {
    const { container } = rendre(
      <PointsPresence
        presence={presence}
        transmissions={{ nuitMatin: 'ok', matinSoir: 'manque', soirNuit: null }}
        derniere
      />,
    )
    const l = liens(container)
    expect(l.map((x) => x.etat)).toEqual(['ok', 'manque', 'aucune'])
    // Centrés : les deux traits du bord s'étirent à parts égales, celui du
    // milieu est fixe.
    expect(l[0].classe).toContain('flex-1')
    expect(l[1].classe).not.toContain('flex-1')
    expect(l[2].classe).toContain('flex-1')
    // Dernière colonne : son triangle de nuit au bord droit, à cheval.
    expect(periodes(container)).toEqual(['matin', 'soir', 'nuit'])
    expect(classe(container, 'nuit')).toContain('right-0')
    expect(classe(container, 'nuit')).toContain('translate-x-1/2')
    expect(container.querySelector('[data-periode="nuit"] path')).not.toBeNull()
    const nom = container
      .querySelector('[aria-label]')!
      .getAttribute('aria-label')!
    expect(nom).toContain('Transmission matin → soir : personne pour la faire')
    expect(nom).toContain('Transmission nuit → matin : assurée')
  })

  it('le triangle de la veille se pose sur la frontière, la nuit du jour part au lendemain', () => {
    const { container } = rendre(
      <PointsPresence
        presence={presence}
        transmissions={{ nuitMatin: 'ok', matinSoir: 'ok', soirNuit: 'ok' }}
        veille={[{ ...presence[2], compte: 0, ecart: -1 }]}
      />,
    )
    // Refusé : la nuit du jour n'est pas dans sa case (le lendemain la pose).
    expect(periodes(container)).toEqual(['matin', 'soir', 'nuit-veille'])
    const veille = classe(container, 'nuit-veille')
    expect(veille).toContain('left-0')
    expect(veille).toContain('-translate-x-1/2')
    expect(veille).toContain('text-red-500')
    expect(
      container.querySelector('[aria-label]')!.getAttribute('aria-label'),
    ).toContain('Nuit : 0 pour 1 (1 de moins) (la veille)')
  })

  it('sans transmissions lues : les formes seules, centrées', () => {
    const { container } = rendre(<PointsPresence presence={presence} />)
    expect(liens(container)).toEqual([])
  })
})

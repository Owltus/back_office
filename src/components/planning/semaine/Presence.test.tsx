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
    plein: e.firstElementChild?.getAttribute('fill') !== 'none',
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

  it('dans l’infobulle seulement, plus de fil entre les jours (2026-11-03)', () => {
    const { container } = rendre(
      <PointsPresence
        presence={presence}
        transmissions={{ nuitMatin: 'ok', matinSoir: 'manque', soirNuit: null }}
      />,
    )
    // Refusé : aucun trait dessiné, la nuit reste dans sa case.
    expect(container.querySelector('[data-transmission]')).toBeNull()
    expect(
      [...container.querySelectorAll<HTMLElement>('[data-periode]')].map(
        (e) => e.dataset.periode,
      ),
    ).toEqual(['matin', 'soir', 'nuit'])
    const nom = container
      .querySelector('[aria-label]')!
      .getAttribute('aria-label')!
    expect(nom).toContain('Transmission matin → soir : personne pour la faire')
    expect(nom).toContain('Transmission nuit → matin : assurée')
  })
})

// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PointsPresence } from '#/components/planning/semaine/Presence.tsx'
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
    classe: e.className,
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
    expect(p[0].classe).toContain('bg-red-500')
    expect(p[1].classe).toContain('bg-emerald-500')
    expect(p[2].classe).toContain('border')
    expect(p[2].classe).not.toMatch(/bg-/)
    expect(
      container.querySelector('[aria-label]')?.getAttribute('aria-label'),
    ).toContain('Nuit : rien de demandé')
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
    expect(points(container)[2].classe).toContain('bg-sky-500')
    cleanup()
    const vide = rendre(<PointsPresence presence={undefined} />)
    expect(points(vide.container)).toEqual([])
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { BandeauEnvironnement } from '#/components/shared/BandeauEnvironnement.tsx'

afterEach(cleanup)

describe('BandeauEnvironnement', () => {
  it('en local sous vite dev : visible, superposé, transparent aux clics', () => {
    render(<BandeauEnvironnement cible="locale" modeDev />)
    const bandeau = screen.getByRole('status', { name: 'DEV · base locale' })
    expect(bandeau.textContent).toBe('DEV · base locale')
    expect(bandeau.className).toContain('fixed')
    expect(bandeau.className).toContain('pointer-events-none')
  })

  it.each([
    ['locale', false],
    ['prod', false],
    ['prod', true],
    ['autre', true],
  ] as const)('cible %s, dev %s : rien', (cible, modeDev) => {
    const { container } = render(
      <BandeauEnvironnement cible={cible} modeDev={modeDev} />,
    )
    expect(container.innerHTML).toBe('')
  })
})

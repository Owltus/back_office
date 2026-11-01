// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDepartFiche } from '#/components/planning/parametres/equipe/SommaireFiche.tsx'

/*
 * Fiche ouverte par un lien (`salarie-3.semaine`) : elle va d'emblée à la
 * partie visée, une fois ; sans partie, ou sur une partie absente, elle reste
 * en haut.
 */

afterEach(cleanup)

const PARTIES = [
  { libelle: 'Identité', partie: 'Identité et contrat' },
  { libelle: 'Semaine type', partie: 'Semaine type' },
]

function Fiche({ depart }: { depart?: string }) {
  const zone = useRef<HTMLDivElement>(null)
  useDepartFiche(zone, depart)
  return (
    <div ref={zone}>
      {PARTIES.map((p) => (
        <section key={p.partie} data-partie={p.partie}>
          {p.libelle}
        </section>
      ))}
    </div>
  )
}

function rendre(depart?: string) {
  const vues: string[] = []
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    vues.push(this.getAttribute('data-partie') ?? '')
  })
  render(<Fiche depart={depart} />)
  return vues
}

describe('useDepartFiche : partie de départ', () => {
  it('va à la partie visée par le lien, sans sommaire affiché', () => {
    expect(rendre('Semaine type')).toEqual(['Semaine type'])
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(
      screen.getByText('Semaine type', { selector: 'section' }),
    ).toBeTruthy()
  })

  it('sans partie, ou partie absente : la fiche reste en haut', () => {
    expect(rendre()).toEqual([])
    cleanup()
    expect(rendre('École')).toEqual([])
  })
})

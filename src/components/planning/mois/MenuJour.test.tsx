// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { analyser } from '#/lib/planning/semaine.ts'
import type { Referentiel } from '#/lib/planning/types.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import { MenuJour } from '#/components/planning/mois/MenuJour.tsx'

/*
 * Menu d'un jour (vue mois). Oracle : un shift dont le code n'est plus
 * permis (ici, repos fixé depuis par la semaine type) montre ce code sur
 * une ligne grisée « actuel », non cliquable, avec la raison.
 */

const LUNDI = '2026-11-02'
const { referentiel, absences } = hotelDemo(LUNDI)

function rendre(ref: Referentiel) {
  const semaine = analyser({
    lundi: LUNDI,
    referentiel: ref,
    absences,
    affectations: [
      {
        id: 7,
        lundi: LUNDI,
        salarie_id: 3,
        poste_id: 2,
        jour: 2,
        horaire_id: 1,
        debut: '07:00',
        fin: '15:45',
        epinglee: true,
        court: false,
        pause: 45,
      },
    ],
    avant: [],
    apres: [],
  })
  const onHoraire = vi.fn()
  render(
    <MenuJour
      ouverture={{ salarieId: 3, date: '2026-11-04', x: 0, y: 0 }}
      titre="Essai"
      personne={ref.salaries.find((s) => s.id === 3)!}
      referentiel={ref}
      jour={2}
      source={{ semaine }}
      shift={semaine.affectations[0]}
      ecrire
      onHoraire={onHoraire}
      onSemaine={vi.fn()}
      onFermer={vi.fn()}
    />,
  )
  return { onHoraire }
}

afterEach(cleanup)

describe('MenuJour : code actuel non permis', () => {
  it('ligne grisée « actuel » avec la raison', () => {
    rendre({
      ...referentiel,
      salaries: referentiel.salaries.map((s) =>
        s.id === 3
          ? {
              ...s,
              semaine_type: s.semaine_type.map((j, i) =>
                i === 2 ? { mode: 'repos' as const } : j,
              ),
            }
          : s,
      ),
    })
    const ligne = screen.getByRole('menuitem', {
      name: 'M, actuel, Repos fixé par sa semaine type',
    })
    expect(ligne.getAttribute('aria-disabled')).toBe('true')
    expect(ligne.tagName).not.toBe('BUTTON')
    // La raison n'est pas répétée sur une seconde ligne.
    expect(screen.getAllByText(/Repos fixé par sa semaine type/)).toHaveLength(
      1,
    )
  })

  it('code encore permis : pas de ligne « actuel »', () => {
    rendre(referentiel)
    expect(screen.queryByRole('menuitem', { name: /actuel/ })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'M, Matin' })).toBeTruthy()
  })
})

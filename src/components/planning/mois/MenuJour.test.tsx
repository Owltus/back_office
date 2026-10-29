// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

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

function rendre(
  ref: Referentiel,
  place?: { posteId: number; horaireId?: number | null },
) {
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
      ouverture={{ salarieId: 3, date: '2026-11-04', x: 0, y: 0, ...place }}
      titre="Essai"
      personne={ref.salaries.find((s) => s.id === 3)!}
      referentiel={ref}
      jour={2}
      source={{ semaine }}
      shift={place ? undefined : semaine.affectations[0]}
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

  it('place à pourvoir : le code choisi est posé sur le poste de la place', () => {
    // Personne 3 : titulaire Réception (2) et Club (3), Réception d'office.
    const { onHoraire } = rendre(referentiel, { posteId: 3 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'AM, Après-midi' }))
    expect(onHoraire).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AM' }),
      3,
    )
  })

  it('place à pourvoir : son code en tête, une seule fois, posé d’un clic', () => {
    const am = referentiel.horaires.find((h) => h.code === 'AM')!
    const { onHoraire } = rendre(referentiel, {
      posteId: 3,
      horaireId: am.id,
    })
    const groupe = screen.getByRole('group', { name: 'Place à pourvoir' })
    const items = screen.getAllByRole('menuitem')
    // Premier élément du menu : le code de la place, focalisé à l'ouverture.
    expect(items[0].getAttribute('aria-label')).toBe('AM, Après-midi')
    expect(groupe.contains(items[0])).toBe(true)
    expect(
      screen.getAllByRole('menuitem', { name: 'AM, Après-midi' }),
    ).toHaveLength(1)
    fireEvent.click(items[0])
    expect(onHoraire).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AM' }),
      3,
    )
  })

  it('sans place : pas de groupe « Place à pourvoir »', () => {
    rendre(referentiel, { posteId: 3 })
    expect(screen.queryByRole('group', { name: 'Place à pourvoir' })).toBeNull()
  })

  it('code encore permis : pas de ligne « actuel »', () => {
    rendre(referentiel)
    expect(screen.queryByRole('menuitem', { name: /actuel/ })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'M, Matin' })).toBeTruthy()
  })
})

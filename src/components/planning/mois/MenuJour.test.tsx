// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'

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
  salarieId = 3,
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
      ouverture={{
        salarieId,
        date: '2026-11-04',
        x: 0,
        y: 0,
        ...place,
      }}
      titre="Essai"
      personne={ref.salaries.find((s) => s.id === salarieId)!}
      referentiel={ref}
      jour={2}
      source={{ semaine }}
      shift={place || salarieId !== 3 ? undefined : semaine.affectations[0]}
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
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Club' })).getByRole(
        'menuitem',
        { name: 'AM, Après-midi' },
      ),
    )
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
    // Pas répété dans la rubrique de son poste ; les autres casquettes le
    // gardent.
    expect(
      within(screen.getByRole('group', { name: 'Club' })).queryByRole(
        'menuitem',
        { name: 'AM, Après-midi' },
      ),
    ).toBeNull()
    expect(
      within(screen.getByRole('group', { name: 'Réception' })).getByRole(
        'menuitem',
        { name: 'AM, Après-midi' },
      ),
    ).toBeTruthy()
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

  it('jour de repos : le menu le dit, sans le cacher', () => {
    const semaine = analyser({
      lundi: LUNDI,
      referentiel,
      absences,
      affectations: [],
      avant: [],
      apres: [],
    })
    const monter = (repos: { fixe: boolean } | null) =>
      render(
        <MenuJour
          ouverture={{ salarieId: 3, date: '2026-11-04', x: 0, y: 0 }}
          titre="Essai"
          personne={referentiel.salaries.find((s) => s.id === 3)!}
          referentiel={referentiel}
          jour={2}
          source={{ semaine }}
          repos={repos}
          ecrire
          onHoraire={vi.fn()}
          onSemaine={vi.fn()}
          onFermer={vi.fn()}
        />,
      )
    monter({ fixe: false })
    expect(screen.getByText(/un horaire choisi ici le remplace/)).toBeTruthy()
    cleanup()
    monter({ fixe: true })
    expect(screen.getByText(/vient de la semaine type/)).toBeTruthy()
    cleanup()
    monter(null)
    expect(screen.queryByText('Repos')).toBeNull()
  })

  it('code encore permis : pas de ligne « actuel »', () => {
    rendre(referentiel)
    expect(screen.queryByRole('menuitem', { name: /actuel/ })).toBeNull()
    expect(
      within(screen.getByRole('group', { name: 'Réception' })).getByRole(
        'menuitem',
        { name: 'M, Matin' },
      ),
    ).toBeTruthy()
  })
})

describe('MenuJour : une rubrique par casquette (mode manuel)', () => {
  const rubriques = () =>
    screen
      .getAllByRole('group')
      .map((g) => g.getAttribute('aria-label'))
      .filter((n) => n !== 'Place à pourvoir')

  it('titulaire avant dépannage, aucun poste hors de sa fiche', () => {
    // Personne 2 : titulaire Réception, dépannage Club.
    rendre(referentiel, undefined, 2)
    expect(rubriques()).toEqual(['Réception', 'Club'])
    expect(
      within(screen.getByRole('group', { name: 'Club' })).getByText(
        'Dépannage',
      ),
    ).toBeTruthy()
    // Personne 6 : titulaire Club, dépannage Réception (l'ordre suit le
    // niveau, pas l'ordre des postes).
    cleanup()
    rendre(referentiel, undefined, 6)
    expect(rubriques()).toEqual(['Club', 'Réception'])
  })

  it('un code pose le shift sur le poste de SA rubrique, sans choisir de poste', () => {
    // Shift actuel : Matin sur Réception. Le Matin du Club change de poste.
    const { onHoraire } = rendre(referentiel)
    const reception = screen.getByRole('group', { name: 'Réception' })
    const club = screen.getByRole('group', { name: 'Club' })
    expect(within(reception).getByLabelText('M, Matin').textContent).toMatch(
      /07:00/,
    )
    fireEvent.click(within(club).getByRole('menuitem', { name: 'M, Matin' }))
    expect(onHoraire).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'M' }),
      3,
    )
    // Le même code sur le même poste : rien à poser.
    onHoraire.mockClear()
    cleanup()
    const deux = rendre(referentiel)
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Réception' })).getByRole(
        'menuitem',
        { name: 'M, Matin' },
      ),
    )
    expect(deux.onHoraire).not.toHaveBeenCalled()
  })
})

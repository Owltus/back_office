// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import {
  DialogHoraireSpecifique,
  erreurSpecifique,
} from '#/components/planning/HoraireSpecifique.tsx'
import type { OuvertureSpecifique } from '#/components/planning/HoraireSpecifique.tsx'
import { ouvertureSpecifique } from '#/components/planning/codesCase.ts'
import type { SourceCase } from '#/components/planning/codesCase.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'

/*
 * Horaire spécifique (demande utilisateur du 2026-11-03) : une fenêtre au
 * clic droit pour le remplir, ou le modifier s'il est déjà posé. Données
 * fictives de l'hôtel de démo.
 */

afterEach(cleanup)

const LUNDI = '2026-11-02'
const { referentiel } = hotelDemo(LUNDI)
const source: SourceCase = { semaine: null, avant: [], apres: [] }
const personne = referentiel.salaries.find((s) => s.id === 3)!

describe('erreurSpecifique', () => {
  it('refuse un début égal à la fin et une pause trop longue', () => {
    expect(
      erreurSpecifique({ debut: '09:00', fin: '17:00', pause: 30 }),
    ).toBeNull()
    expect(
      erreurSpecifique({ debut: '09:00', fin: '09:00', pause: 0 }),
    ).toMatch(/identiques/)
    expect(
      erreurSpecifique({ debut: '09:00', fin: '10:00', pause: 60 }),
    ).toMatch(/pause/)
    // Une nuit qui finit le lendemain est permise.
    expect(
      erreurSpecifique({ debut: '23:00', fin: '07:00', pause: 0 }),
    ).toBeNull()
  })
})

describe('ouvertureSpecifique', () => {
  it('case vide : un point de départ sur son poste, pas une modification', () => {
    const o = ouvertureSpecifique({
      referentiel,
      personne,
      jour: 2,
      source,
      titre: 'T',
    })
    expect(o.modification).toBe(false)
    expect(o.initial).toMatchObject({ debut: '09:00', fin: '17:00', pause: 0 })
    // Seulement les postes qu'elle tient.
    const tenus = personne.competences.map((c) => c.poste_id)
    expect(o.postes.every((p) => tenus.includes(p.id))).toBe(true)
  })
  it('un horaire spécifique déjà posé : ses valeurs, en modification', () => {
    const o = ouvertureSpecifique({
      referentiel,
      personne,
      jour: 2,
      source,
      titre: 'T',
      shift: {
        id: 9,
        poste_id: 2,
        type_shift_id: null,
        debut: '10:30',
        fin: '18:15',
        pause: 30,
      },
    })
    expect(o.modification).toBe(true)
    expect(o.initial).toEqual({
      debut: '10:30',
      fin: '18:15',
      pause: 30,
      poste_id: 2,
    })
    // Refusé : un horaire de la liste n'est pas une modification.
    const code = ouvertureSpecifique({
      referentiel,
      personne,
      jour: 2,
      source,
      titre: 'T',
      shift: {
        id: 9,
        poste_id: 2,
        type_shift_id: 1,
        debut: '07:00',
        fin: '15:45',
        pause: 45,
      },
    })
    expect(code.modification).toBe(false)
    expect(code.initial.debut).toBe('07:00')
  })
})

describe('ouvertureSpecifique : le poste de départ (relecture du 2026-11-03)', () => {
  const ferme = { ...referentiel.postes.find((p) => p.id === 2)!, ferme: true }
  const avecFerme = {
    ...referentiel,
    postes: referentiel.postes.map((p) => (p.id === 2 ? ferme : p)),
  }
  const titulaireFerme = {
    ...personne,
    competences: [
      { poste_id: 2, niveau: 'titulaire' as const },
      { poste_id: 3, niveau: 'occasionnel' as const },
    ],
  }
  it('refusé : jamais un poste fermé, ni proposé ni de départ', () => {
    const o = ouvertureSpecifique({
      referentiel: avecFerme,
      personne: titulaireFerme,
      jour: 2,
      source,
      titre: 'T',
    })
    expect(o.postes.map((p) => p.id)).toEqual([3])
    expect(o.initial.poste_id).toBe(3)
    expect(o.interdit(2)).not.toBeNull()
  })
  it('sans aucun poste : les postes ouverts, et un vrai poste de départ', () => {
    const o = ouvertureSpecifique({
      referentiel: avecFerme,
      personne: { ...personne, competences: [] },
      jour: 2,
      source,
      titre: 'T',
    })
    expect(o.postes.some((p) => p.id === 2)).toBe(false)
    expect(o.postes.some((p) => p.id === o.initial.poste_id)).toBe(true)
    expect(o.interdit(0)).toBe('Choisissez un poste.')
  })
  it('place à pourvoir : la fenêtre part sur son poste', () => {
    const deux = {
      ...personne,
      competences: [
        { poste_id: 2, niveau: 'titulaire' as const },
        { poste_id: 3, niveau: 'occasionnel' as const },
      ],
    }
    const o = ouvertureSpecifique({
      referentiel,
      personne: deux,
      jour: 2,
      source,
      titre: 'T',
      placePosteId: 3,
    })
    expect(o.initial.poste_id).toBe(3)
  })
})

describe('DialogHoraireSpecifique', () => {
  const ouverture = (
    kw: Partial<OuvertureSpecifique> = {},
  ): OuvertureSpecifique => ({
    titre: 'Une personne · mercredi 4',
    modification: true,
    initial: { debut: '10:00', fin: '18:00', pause: 30, poste_id: 2 },
    postes: referentiel.postes.filter((p) => p.id === 2 || p.id === 3),
    niveau: () => 'titulaire',
    interdit: () => null,
    ferme: null,
    ...kw,
  })

  it('montre les valeurs du shift et enregistre la modification', () => {
    const onValider = vi.fn()
    const onFermer = vi.fn()
    render(
      <DialogHoraireSpecifique
        ouverture={ouverture()}
        onValider={onValider}
        onFermer={onFermer}
      />,
    )
    expect(
      screen.getByRole('dialog', { name: "Modifier l'horaire spécifique" }),
    ).toBeTruthy()
    expect((screen.getByLabelText('Début') as HTMLInputElement).value).toBe(
      '10:00',
    )
    fireEvent.change(screen.getByLabelText('Fin'), {
      target: { value: '19:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onValider).toHaveBeenCalledWith({
      debut: '10:00',
      fin: '19:00',
      pause: 30,
      poste_id: 2,
    })
    expect(onFermer).toHaveBeenCalled()
  })

  it('refusé : heures invalides ou jour fermé, rien ne s’enregistre', () => {
    const onValider = vi.fn()
    const { unmount } = render(
      <DialogHoraireSpecifique
        ouverture={ouverture({ modification: false })}
        onValider={onValider}
        onFermer={() => {}}
      />,
    )
    fireEvent.change(screen.getByLabelText('Fin'), {
      target: { value: '10:00' },
    })
    const poser = screen.getByRole('button', { name: 'Poser ce shift' })
    expect(poser).toHaveProperty('disabled', true)
    fireEvent.click(poser)
    expect(onValider).not.toHaveBeenCalled()
    unmount()
    render(
      <DialogHoraireSpecifique
        ouverture={ouverture({ interdit: () => "Jour d'école." })}
        onValider={onValider}
        onFermer={() => {}}
      />,
    )
    expect(screen.getByText("Jour d'école.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toHaveProperty(
      'disabled',
      true,
    )
  })
})

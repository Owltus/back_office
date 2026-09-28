// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import type { DbClasseur } from '#/lib/classeur/types.ts'

/*
 * Dialogue d'accès contre un service simulé (la base n'est pas touchée).
 * Oracles : le niveau EFFECTIF affiché suit la règle (plafond de page),
 * un choix appelle le bon service, aucune adresse e-mail n'apparaît.
 */

const definirAcces = vi.fn(() => Promise.resolve())
const definirAccesTous = vi.fn(() => Promise.resolve())

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/classeur/service.ts', () => ({
  fetchPersonnesClasseur: () =>
    Promise.resolve([
      {
        id: 'u-lect',
        prenom: 'Léa',
        nom: 'Martin',
        nom_affiche: '',
        niveau_page: 'lecture',
      },
      {
        id: 'u-ecri',
        prenom: 'Hugo',
        nom: 'Petit',
        nom_affiche: '',
        niveau_page: 'ecriture',
      },
      {
        id: 'u-gest',
        prenom: 'Admin',
        nom: '',
        nom_affiche: '',
        niveau_page: 'gestion',
      },
    ]),
  fetchAccesClasseur: () =>
    Promise.resolve([
      { id: 1, classeur_id: 5, user_id: 'u-lect', niveau: 'ecriture' },
    ]),
  definirAcces: (...a: unknown[]) => definirAcces(...(a as [])),
  definirAccesTous: (...a: unknown[]) => definirAccesTous(...(a as [])),
}))

const { AccesClasseurDialog } =
  await import('#/components/classeur/dialogs/AccesClasseurDialog.tsx')

const classeur = {
  id: 5,
  name: 'Procédures',
  created_by: 'u-gest',
  acces_tous: 'lecture',
} as DbClasseur

afterEach(cleanup)

// Radix Select dans jsdom : capture du pointeur et défilement absents.
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  scrollIntoView: () => {},
})

/** Ouvre le menu d'une personne et choisit une option (clavier + clic). */
function choisir(libelle: string, option: string | RegExp) {
  const declencheur = screen.getByLabelText(libelle)
  fireEvent.keyDown(declencheur, { key: 'Enter' })
  fireEvent.click(screen.getByRole('option', { name: option }))
}

function ouvrir() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AccesClasseurDialog classeur={classeur} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

describe('AccesClasseurDialog', () => {
  it('niveau effectif : l’écriture d’une personne en lecture sur la page est plafonnée', async () => {
    ouvrir()
    await waitFor(() => screen.getByText('Léa Martin'))
    const lea = screen.getByText('Léa Martin').closest('li')!
    expect(lea.textContent).toContain('Effectif : Lecture')
    expect(lea.textContent).toContain('plafonné par la page')
    const hugo = screen.getByText('Hugo Petit').closest('li')!
    expect(hugo.textContent).toContain('Effectif : Lecture')
    // La gestion n'a pas de réglage : accès complet.
    expect(screen.getByText('Accès complet')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/@/)
  })
  it('changer l’accès d’une personne, et l’accès pour tous', async () => {
    ouvrir()
    await waitFor(() => screen.getByText('Hugo Petit'))
    choisir('Accès de Hugo Petit', 'Écriture')
    await waitFor(() =>
      expect(definirAcces).toHaveBeenCalledWith(5, 'u-ecri', 'ecriture'),
    )
    choisir('Accès de Léa Martin', /Comme tout le monde/)
    await waitFor(() =>
      expect(definirAcces).toHaveBeenCalledWith(5, 'u-lect', null),
    )
    fireEvent.click(screen.getByRole('radio', { name: /Privé/ }))
    await waitFor(() =>
      expect(definirAccesTous).toHaveBeenCalledWith(5, 'aucun'),
    )
  })
})

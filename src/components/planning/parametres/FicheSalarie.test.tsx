// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import type { Absence } from '#/lib/planning/types.ts'

/*
 * Fiche d'un membre du staff contre un service simulé (la base n'est pas
 * touchée). Oracles : en lecture, rien n'est modifiable ; en gestion,
 * Enregistrer envoie la fiche attendue, une période d'absence pose CHAQUE
 * jour (week-end compris), le changement de catégorie retire les postes
 * qu'elle ne permet pas, la suppression passe par une confirmation.
 */

const etat = vi.hoisted(() => ({
  niveau: 'gestion',
  absences: [] as Absence[],
}))
const service = vi.hoisted(() => ({
  enregistrerSalarie: vi.fn(async (_v: unknown, id: number | null) => id ?? 99),
  poserAbsences: vi.fn(async () => {}),
  supprimerSalarie: vi.fn(async () => {}),
}))

const demo = hotelDemo('2026-11-02')

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/planning/solveur.ts', () => ({ resoudre: vi.fn() }))
vi.mock('#/components/auth/AuthContext.tsx', () => ({
  useAuth: () => ({
    permsResolved: true,
    can: (_page: string, min: string) => {
      const rang: Record<string, number> = {
        lecture: 1,
        ecriture: 2,
        gestion: 3,
      }
      return rang[etat.niveau] >= rang[min]
    },
  }),
}))
vi.mock('#/lib/planning/service.ts', () => ({
  fetchReferentiel: async () => structuredClone(demo.referentiel),
  fetchAbsencesSalarie: async (id: number) =>
    etat.absences.filter((a) => a.salarie_id === id),
  fetchSemaine: vi.fn(),
  fetchEtatSemaine: vi.fn(),
  appliquerGeneration: vi.fn(),
  enregistrerSalarie: (...a: [unknown, number | null]) =>
    service.enregistrerSalarie(...a),
  poserAbsences: (...a: unknown[]) => service.poserAbsences(...(a as [])),
  supprimerSalarie: (...a: unknown[]) => service.supprimerSalarie(...(a as [])),
}))

const { FicheSalarie } =
  await import('#/components/planning/parametres/FicheSalarie.tsx')
const { Enveloppe, choisir, preparerJsdom } =
  await import('#/components/planning/parametres/equipe/testOutils.tsx')

preparerJsdom()
afterEach(cleanup)
beforeEach(() => {
  etat.niveau = 'gestion'
  etat.absences = []
  vi.clearAllMocks()
})

const onFermer = vi.fn()

function ouvrir(salarieId: number | null) {
  render(
    <Enveloppe>
      <FicheSalarie salarieId={salarieId} ouvert onFermer={onFermer} />
    </Enveloppe>,
  )
}

// Lucas Petit : hôtelier CDI 39 h, Réception et Club titulaire, sans absence.
const LUCAS = 3

describe('FicheSalarie', () => {
  it('en lecture : champs grisés, ni Enregistrer actif ni Supprimer', async () => {
    etat.niveau = 'lecture'
    ouvrir(LUCAS)
    expect(
      await screen.findByRole('heading', { name: 'Lucas Petit' }),
    ).toBeTruthy()
    expect(screen.getByText('Lecture seule')).toBeTruthy()
    expect(screen.getByLabelText('Prénom').hasAttribute('disabled')).toBe(true)
    expect(
      screen
        .getByRole('button', { name: 'Enregistrer' })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /Ajouter une absence/ }),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: /Faire évoluer/ })).toBeNull()
  })

  it('en écriture (sans gestion) : la fiche reste en lecture seule', async () => {
    etat.niveau = 'ecriture'
    ouvrir(LUCAS)
    await screen.findByRole('heading', { name: 'Lucas Petit' })
    expect(
      screen
        .getByRole('button', { name: 'Enregistrer' })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('en gestion : Enregistrer envoie la fiche modifiée', async () => {
    ouvrir(LUCAS)
    const prenom = await screen.findByLabelText<HTMLInputElement>('Prénom')
    fireEvent.change(prenom, { target: { value: 'Luc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(service.enregistrerSalarie).toHaveBeenCalledTimes(1),
    )
    const lucas = demo.referentiel.salaries.find((s) => s.id === LUCAS)!
    const [valeurs, id] = service.enregistrerSalarie.mock.calls[0]
    expect(id).toBe(LUCAS)
    expect(valeurs).toEqual({
      prenom: 'Luc',
      nom: 'Petit',
      groupe_id: lucas.groupe_id,
      type_contrat: 'cdi',
      heures_hebdo: 39,
      forfait_jours: false,
      mineur: false,
      competences: lucas.competences,
      semaine_type: Array.from({ length: 7 }, () => ({
        mode: 'auto',
        type_shift_id: null,
        type_absence_id: null,
      })),
      shifts_autorises: [],
      date_entree: null,
      date_sortie: null,
      actif: true,
      suite_de: null,
    })
    // Aucune absence changée : aucun appel.
    expect(service.poserAbsences).not.toHaveBeenCalled()
    await waitFor(() => expect(onFermer).toHaveBeenCalled())
    expect(await screen.findByText('Fiche enregistrée')).toBeTruthy()
  })

  it("une période d'absence pose chacun de ses jours, week-end compris", async () => {
    ouvrir(LUCAS)
    fireEvent.click(
      await screen.findByRole('button', { name: /Ajouter une absence/ }),
    )
    fireEvent.change(screen.getByLabelText('Du'), {
      target: { value: '2026-11-06' },
    })
    fireEvent.change(screen.getByLabelText('Au'), {
      target: { value: '2026-11-09' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(service.poserAbsences).toHaveBeenCalledTimes(1))
    const conges = demo.referentiel.motifs.find((m) => m.code === 'CP')!.id
    expect(service.poserAbsences).toHaveBeenCalledWith(
      LUCAS,
      ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'],
      conges,
    )
  })

  it("retirer une période ne retire que ses jours, raccourcir n'enlève que la fin", async () => {
    etat.absences = ['2026-11-02', '2026-11-03', '2026-11-04'].map(
      (jour, i) => ({
        id: i + 1,
        salarie_id: LUCAS,
        jour,
        motif_id: 1,
      }),
    )
    ouvrir(LUCAS)
    const au = await screen.findByLabelText<HTMLInputElement>('Au')
    expect(au.value).toBe('2026-11-04')
    fireEvent.change(au, { target: { value: '2026-11-03' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(service.poserAbsences).toHaveBeenCalledTimes(1))
    expect(service.poserAbsences).toHaveBeenCalledWith(
      LUCAS,
      ['2026-11-04'],
      null,
    )
  })

  it('changer de catégorie retire les postes non prévus', async () => {
    // Marc Leroy (Direction) : Responsable technique, que les Hôteliers ne tiennent pas.
    ouvrir(9)
    await screen.findByRole('heading', { name: 'Marc Leroy' })
    expect(
      screen.getByRole('radiogroup', {
        name: 'Niveau sur Responsable technique',
      }),
    ).toBeTruthy()
    choisir('Catégorie', 'Hôteliers')
    expect(
      screen.queryByRole('radiogroup', {
        name: 'Niveau sur Responsable technique',
      }),
    ).toBeNull()
    expect(await screen.findByText(/1 compétence retirée/)).toBeTruthy()
    expect(
      screen.getByText(/Aucun poste : elle ne peut pas être planifiée/),
    ).toBeTruthy()
  })

  it('créer : fiche vierge, prénom exigé, puis insertion', async () => {
    ouvrir(null)
    expect(
      await screen.findByRole('heading', { name: 'Nouveau membre' }),
    ).toBeTruthy()
    const enregistrer = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Enregistrer',
    })
    expect(enregistrer.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull()
    fireEvent.change(screen.getByLabelText('Prénom'), {
      target: { value: 'Zoé' },
    })
    fireEvent.click(enregistrer)
    await waitFor(() =>
      expect(service.enregistrerSalarie).toHaveBeenCalledTimes(1),
    )
    const [valeurs, id] = service.enregistrerSalarie.mock.calls[0]
    expect(id).toBeNull()
    expect(valeurs).toMatchObject({
      prenom: 'Zoé',
      type_contrat: 'cdi',
      heures_hebdo: 39,
      actif: true,
    })
  })

  it('supprimer demande confirmation puis appelle le service', async () => {
    ouvrir(LUCAS)
    fireEvent.click(await screen.findByRole('button', { name: /Supprimer/ }))
    expect(service.supprimerSalarie).not.toHaveBeenCalled()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Supprimer la fiche' }),
    )
    await waitFor(() =>
      expect(service.supprimerSalarie).toHaveBeenCalledWith(LUCAS),
    )
  })

  it('fermer avec des modifications demande confirmation', async () => {
    ouvrir(LUCAS)
    fireEvent.change(await screen.findByLabelText('Nom'), {
      target: { value: 'Petitjean' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onFermer).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Abandonner' }))
    expect(onFermer).toHaveBeenCalled()
  })

  it('le bloc École remplit les semaines par rythme (apprentie)', async () => {
    // Chloé Lambert, apprentie : le bloc École gère ses jours d'école.
    ouvrir(11)
    expect(await screen.findByRole('region', { name: 'École' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Semaines à l'hôtel"), {
      target: { value: '0' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remplir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(service.poserAbsences).toHaveBeenCalled())
    const ecole = demo.referentiel.motifs.find((m) => m.code === 'EC')!.id
    const [, jours, motif] = service.poserAbsences.mock.calls[0] as unknown as [
      number,
      string[],
      number,
    ]
    expect(motif).toBe(ecole)
    // 26 semaines de 5 jours, aucune le week-end.
    expect(jours).toHaveLength(26 * 5)
    expect(
      jours.every(
        (j) => ![0, 6].includes(new Date(`${j}T12:00:00Z`).getUTCDay()),
      ),
    ).toBe(true)
  })

  it('aperçu des règles : suit le contrat', async () => {
    ouvrir(LUCAS)
    const regles = await screen.findByRole('list', {
      name: 'Règles HCR appliquées',
    })
    expect(regles.textContent).toContain('R-SEMAINE-MAX')
    expect(regles.textContent).not.toContain('R-NUIT-MINEUR')
    fireEvent.click(screen.getByLabelText('Mineur (16-18 ans)'))
    expect(
      screen.getByRole('list', { name: 'Règles HCR appliquées' }).textContent,
    ).toContain('R-NUIT-MINEUR')
  })
})

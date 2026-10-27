// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { FilMessages } from '#/components/planning/Messages.tsx'
import { TooltipProvider } from '#/components/ui/tooltip.tsx'
import { planningKeys } from '#/lib/planning/keys.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import type { Absence, Affectation } from '#/lib/planning/types.ts'

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
  verrous: [] as string[],
  shifts: [] as Affectation[],
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
  fetchReferentiel: async () => ({
    ...structuredClone(demo.referentiel),
    verrous: [...etat.verrous],
  }),
  fetchAbsencesSalarie: async (id: number) =>
    etat.absences.filter((a) => a.salarie_id === id),
  fetchShiftsSalarie: async (id: number) =>
    etat.shifts.filter((a) => a.salarie_id === id),
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
  etat.verrous = []
  etat.shifts = []
  vi.clearAllMocks()
  service.enregistrerSalarie.mockImplementation(
    async (_v: unknown, id: number | null) => id ?? 99,
  )
  service.poserAbsences.mockImplementation(async () => {})
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

const jourAbsent = (jour: string, motif_id = 1, id = 0): Absence => ({
  id,
  salarie_id: LUCAS,
  jour,
  motif_id,
})

/** Les jours d'absence de `debut` à `fin` (compris). */
function joursEntre(debut: string, fin: string): string[] {
  const r: string[] = []
  for (
    let d = new Date(`${debut}T12:00:00Z`);
    d.toISOString().slice(0, 10) <= fin;
    d = new Date(d.getTime() + 86_400_000)
  )
    r.push(d.toISOString().slice(0, 10))
  return r
}

const enregistrerEtAttendre = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  await waitFor(() => expect(onFermer).toHaveBeenCalled())
}

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

  it('le bloc École : une semaine, un samedi seul, puis les dates du CFA (apprentie)', async () => {
    // Chloé Lambert, apprentie : le bloc École gère ses jours d'école.
    ouvrir(11)
    expect(await screen.findByRole('region', { name: 'École' })).toBeTruthy()
    // S45 : du lundi 2 au vendredi 6 novembre 2026.
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Semaine 45 : école du lundi au vendredi',
      }),
    )
    // Un samedi d'examen, seul.
    fireEvent.click(screen.getByRole('button', { name: /^sam\. 7 nov\. 2026/ }))
    fireEvent.click(screen.getByRole('button', { name: /Dates du CFA/ }))
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Dates du CFA' }),
      {
        target: {
          value: 'En entreprise du 09/11 au 13/11\ndu 16/11 au 18/11/2026',
        },
      },
    )
    expect(screen.getByText(/1 période, 3 jours d'école/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(service.poserAbsences).toHaveBeenCalled())
    const ecole = demo.referentiel.motifs.find((m) => m.code === 'EC')!.id
    const [, jours, motif] = service.poserAbsences.mock.calls[0] as unknown as [
      number,
      string[],
      number,
    ]
    expect(motif).toBe(ecole)
    expect([...jours].sort()).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
    ])
  })

  it('un shift déjà posé sur un nouveau jour d école est annoncé, puis signalé à l enregistrement', async () => {
    etat.shifts = [
      {
        id: 501,
        lundi: '2026-11-09',
        salarie_id: 11,
        poste_id: demo.referentiel.postes[0].id,
        jour: 1,
        horaire_id: null,
        debut: '07:00',
        fin: '15:00',
        epinglee: true,
        court: false,
        pause: 0,
      },
    ]
    ouvrir(11)
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Semaine 46 : école du lundi au vendredi',
      }),
    )
    expect(
      await screen.findByText(/1 shift déjà posé tombe sur l'école/),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(
      await screen.findByText(
        /1 shift est retiré pour son absence ou son école : mar\. 10 nov\. 2026/,
      ),
    ).toBeTruthy()
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

  it("s'ouvre sur les absences RELUES, pas sur celles du cache", async () => {
    // Le cache dit « aucune absence » ; depuis, le planning en a posé une.
    etat.absences = [jourAbsent('2026-11-10')]
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    // Référentiel déjà en cache aussi : rien n'attend le réseau pour s'ouvrir.
    qc.setQueryData(
      planningKeys.referentiel(),
      structuredClone(demo.referentiel),
    )
    qc.setQueryData(planningKeys.absences(LUCAS), [])
    render(
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <FilMessages>
            <FicheSalarie salarieId={LUCAS} ouvert onFermer={onFermer} />
          </FilMessages>
        </TooltipProvider>
      </QueryClientProvider>,
    )
    const au = await screen.findByLabelText<HTMLInputElement>('Au')
    expect(au.value).toBe('2026-11-10')
    fireEvent.change(screen.getByLabelText('Prénom'), {
      target: { value: 'Luc' },
    })
    await enregistrerEtAttendre()
    expect(service.poserAbsences).not.toHaveBeenCalled()
  })

  it('un jour posé depuis le planning pendant la saisie est gardé', async () => {
    ouvrir(LUCAS)
    const prenom = await screen.findByLabelText<HTMLInputElement>('Prénom')
    // Fiche ouverte sans absence ; le planning en pose une entre-temps.
    etat.absences = [jourAbsent('2026-11-10')]
    fireEvent.change(prenom, { target: { value: 'Luc' } })
    await enregistrerEtAttendre()
    expect(service.poserAbsences).not.toHaveBeenCalled()
  })

  it('les jours des semaines verrouillées ne sont pas touchés, et le message le dit', async () => {
    etat.verrous = ['2026-11-02']
    etat.absences = [
      ...['2026-11-02', '2026-11-03', '2026-11-04'].map((j, i) =>
        jourAbsent(j, 1, i + 1),
      ),
      jourAbsent('2026-11-10', 1, 4),
    ]
    ouvrir(LUCAS)
    await screen.findAllByLabelText('Au')
    for (const b of screen.getAllByRole('button', {
      name: "Retirer l'absence",
    }))
      fireEvent.click(b)
    await enregistrerEtAttendre()
    expect(service.poserAbsences).toHaveBeenCalledTimes(1)
    expect(service.poserAbsences).toHaveBeenCalledWith(
      LUCAS,
      ['2026-11-10'],
      null,
    )
    expect(await screen.findByText(/en semaine verrouillée/)).toBeTruthy()
  })

  it('une longue absence lue en base ne bloque pas l’enregistrement', async () => {
    etat.absences = joursEntre('2026-11-02', '2030-11-15').map((j, i) =>
      jourAbsent(j, 1, i + 1),
    )
    ouvrir(LUCAS)
    fireEvent.change(await screen.findByLabelText('Prénom'), {
      target: { value: 'Luc' },
    })
    await enregistrerEtAttendre()
    expect(service.enregistrerSalarie).toHaveBeenCalledTimes(1)
    expect(service.poserAbsences).not.toHaveBeenCalled()
  })

  /** Ouvre le bloc Nouveau contrat au 04/01/2027 et le valide. */
  async function evoluerAu4Janvier() {
    fireEvent.click(
      await screen.findByRole('button', { name: /Faire évoluer le contrat/ }),
    )
    fireEvent.change(screen.getByLabelText('À partir du'), {
      target: { value: '2027-01-04' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Créer le nouveau contrat' }),
    )
  }

  it('évolution : les absences sont posées sur le nouveau contrat AVANT d’être retirées de l’ancien', async () => {
    etat.absences = [jourAbsent('2027-02-10')]
    ouvrir(LUCAS)
    await evoluerAu4Janvier()
    await waitFor(() => expect(service.poserAbsences).toHaveBeenCalledTimes(2))
    expect(service.poserAbsences).toHaveBeenNthCalledWith(
      1,
      99,
      ['2027-02-10'],
      1,
    )
    expect(service.poserAbsences).toHaveBeenNthCalledWith(
      2,
      LUCAS,
      ['2027-02-10'],
      null,
    )
  })

  it('évolution : la pose sur le nouveau contrat échoue, l’ancien garde ses absences', async () => {
    etat.absences = [jourAbsent('2027-02-10')]
    service.poserAbsences.mockImplementation(async (...a: unknown[]) => {
      if (a[0] === 99) throw new Error('refus')
    })
    ouvrir(LUCAS)
    await evoluerAu4Janvier()
    await waitFor(() => expect(onFermer).toHaveBeenCalled())
    expect(service.poserAbsences).toHaveBeenCalledTimes(1)
    expect(service.poserAbsences).not.toHaveBeenCalledWith(
      LUCAS,
      expect.anything(),
      null,
    )
  })

  it('évolution refusée : le contrat est rétabli tel qu’enregistré, pas tel que saisi', async () => {
    service.enregistrerSalarie.mockImplementation(
      async (_v: unknown, id: number | null) => {
        if (id === null) throw new Error('refus')
        return id
      },
    )
    ouvrir(LUCAS)
    fireEvent.change(await screen.findByLabelText('Prénom'), {
      target: { value: 'Luc' },
    })
    await evoluerAu4Janvier()
    await waitFor(() =>
      expect(service.enregistrerSalarie).toHaveBeenCalledTimes(3),
    )
    const [valeurs, id] = service.enregistrerSalarie.mock.calls[2] as [
      { prenom: string; date_sortie: string | null },
      number,
    ]
    expect(id).toBe(LUCAS)
    expect(valeurs.prenom).toBe('Lucas')
    expect(valeurs.date_sortie).toBeNull()
  })
})

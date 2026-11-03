// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
  /** Shifts + absences par contrat (0 par défaut : jamais servi). */
  historique: {} as Record<number, number>,
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
  fetchHistoriqueContrats: async (ids: number[]) =>
    Object.fromEntries(ids.map((i) => [i, etat.historique[i] ?? 0])),
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
  etat.historique = {}
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
    expect(
      screen.queryByRole('button', { name: /Changer de poste/ }),
    ).toBeNull()
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

  it('horaires : Tous dit combien, Seulement démarre tout coché et garde un horaire', async () => {
    ouvrir(LUCAS)
    const choix = await screen.findByRole('radiogroup', {
      name: 'Horaires autorisés',
    })
    // M, MI, AM et leurs versions étoile (2026-11-02).
    expect(screen.getByText('Les 6 horaires de ses postes.')).toBeTruthy()
    fireEvent.click(
      within(choix).getByRole('radio', { name: 'Seulement ceux-ci' }),
    )
    // Un horaire se lit par ses heures (M, MI, AM de l'hôtel fictif).
    const horaire = (nom: string) => screen.getByRole('button', { name: nom })
    for (const c of ['07:00–15:45', '09:00–17:45', '15:00–23:45'])
      expect(horaire(c).getAttribute('aria-pressed')).toBe('true')
    for (const c of ['07:00–14:45', '09:00–16:45', '15:00–22:45']) {
      expect(horaire(c).getAttribute('aria-pressed')).toBe('true')
      fireEvent.click(horaire(c))
    }
    fireEvent.click(horaire('15:00–23:45'))
    fireEvent.click(horaire('09:00–17:45'))
    fireEvent.click(horaire('07:00–15:45'))
    expect(horaire('07:00–15:45').getAttribute('aria-pressed')).toBe('true')
    expect(
      screen.getByText('Gardez au moins un horaire, ou choisissez Tous.'),
    ).toBeTruthy()
    await enregistrerEtAttendre()
    expect(service.enregistrerSalarie.mock.calls[0][0]).toMatchObject({
      shifts_autorises: [1],
    })
  })

  describe('la fiche hérite des horaires de ses postes', () => {
    // M=1 (07:00–15:45), MI=2, AM=3 (15:00–23:45), N=4 (23:00–07:45), D=5,
    // T=6 (08:00–16:45) ; Réception=2, Club=3.
    let avant: typeof demo.referentiel
    beforeEach(() => {
      avant = structuredClone(demo.referentiel)
    })
    afterEach(() => {
      demo.referentiel = avant
    })
    const lucas = () => demo.referentiel.salaries.find((s) => s.id === LUCAS)!

    it('poste restreint à 2 horaires : la semaine type ne propose que ces 2 horaires', async () => {
      for (const p of demo.referentiel.postes)
        if (p.id === 2 || p.id === 3) p.horaires_autorises = [1, 3]
      ouvrir(LUCAS)
      const lignes = await screen.findByRole('list', {
        name: 'Horaires par poste',
      })
      expect(lignes.textContent).toContain(
        'Réception : les 2 horaires du poste',
      )
      expect(lignes.textContent).toContain('Club : les 2 horaires du poste')
      fireEvent.keyDown(screen.getByLabelText('Horaire du lundi'), {
        key: 'Enter',
      })
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Ses horaires',
        '07:00–15:45',
        '15:00–23:45',
      ])
    })

    it('horaire mort : barré, retiré en un clic', async () => {
      lucas().shifts_autorises = [1, 6]
      ouvrir(LUCAS)
      const morts = await screen.findByRole('list', {
        name: 'Horaires plus prévus',
      })
      expect(morts.textContent).toContain(
        "Cet horaire n'est plus prévu pour ses postes.",
      )
      fireEvent.click(
        within(morts).getByRole('button', { name: 'Retirer 08:00–16:45' }),
      )
      expect(
        screen.queryByRole('list', { name: 'Horaires plus prévus' }),
      ).toBeNull()
      await enregistrerEtAttendre()
      expect(service.enregistrerSalarie.mock.calls[0][0]).toMatchObject({
        shifts_autorises: [1],
      })
    })

    it('aucun horaire utilisable sur un poste : la fiche le dit, le dernier horaire mort reste', async () => {
      lucas().shifts_autorises = [6]
      ouvrir(LUCAS)
      const lignes = await screen.findByRole('list', {
        name: 'Horaires par poste',
      })
      expect(
        within(lignes).getAllByText(
          "Aucun de ses horaires n'est prévu sur ce poste : elle n'y sera pas planifiée.",
        ),
      ).toHaveLength(2)
      expect(
        screen
          .getByRole('button', { name: 'Retirer 08:00–16:45' })
          .hasAttribute('disabled'),
      ).toBe(true)
      // L'enregistrement reste permis (D4).
      await enregistrerEtAttendre()
      expect(service.enregistrerSalarie).toHaveBeenCalledTimes(1)
    })

    it('un horaire fixé devenu impossible est signalé dans la case', async () => {
      lucas().semaine_type[0] = {
        mode: 'travail',
        type_shift_id: 4,
        type_absence_id: null,
      }
      ouvrir(LUCAS)
      expect(
        await screen.findByText(
          "23:00–07:45 n'est plus possible pour elle ce jour-là. Choisissez un autre horaire.",
        ),
      ).toBeTruthy()
      expect(
        screen.queryAllByText(/n'est plus possible pour elle/),
      ).toHaveLength(1)
    })
  })

  it('absences : sans les repos, À venir puis Passées, les anciennes repliées (2026-11-03)', async () => {
    const repos = {
      id: 99,
      code: 'R',
      nom: 'Repos',
      couleur: '#999999',
      decompte: false,
      nature: 'repos' as const,
    }
    demo.referentiel.motifs.push(repos)
    // 12 jours de maladie passés, séparés (12 périodes), un congé et une
    // formation à venir, et des repos des deux côtés.
    const passes = Array.from({ length: 12 }, (_, i) =>
      jourAbsent(
        `2025-0${1 + Math.floor(i / 4)}-${String(3 + 7 * (i % 4)).padStart(2, '0')}`,
        3,
        100 + i,
      ),
    )
    etat.absences = [
      ...passes,
      ...joursEntre('2027-02-01', '2027-02-05').map((j, i) =>
        jourAbsent(j, 1, 200 + i),
      ),
      jourAbsent('2027-01-10', 5, 300),
      jourAbsent('2027-01-03', 99, 301),
      jourAbsent('2025-05-05', 99, 302),
    ]
    try {
      ouvrir(LUCAS)
      const avenir = await screen.findByRole('tab', { name: /À venir/ })
      expect(avenir.getAttribute('aria-selected')).toBe('true')
      // À venir : la plus proche d'abord, aucun repos.
      const debuts = () =>
        screen
          .getAllByTestId('periode-absence')
          .map(
            (li) => (within(li).getByLabelText('Du') as HTMLInputElement).value,
          )
      expect(debuts()).toEqual(['2027-01-10', '2027-02-01'])
      // Passées : la plus récente d'abord, 10 au plus, le reste replié.
      fireEvent.click(screen.getByRole('tab', { name: /Passées/ }))
      expect(debuts()).toHaveLength(10)
      expect(debuts()[0]).toBe('2025-03-24')
      fireEvent.click(
        screen.getByRole('button', {
          name: /Afficher les plus anciennes \(2\)/,
        }),
      )
      expect(debuts()).toHaveLength(12)
      expect(debuts().at(-1)).toBe('2025-01-03')
      // Les repos masqués ne sont pas retirés à l'enregistrement.
      fireEvent.change(screen.getByLabelText('Nom'), {
        target: { value: 'Petit-Martin' },
      })
      await enregistrerEtAttendre()
      expect(service.poserAbsences).not.toHaveBeenCalled()
    } finally {
      demo.referentiel.motifs.splice(demo.referentiel.motifs.indexOf(repos), 1)
    }
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
    choisir('Groupe', 'Hôteliers')
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

  it('ajouter un contrat : refusé s’il recouvre le sien, accepté après sa fin (2026-11-03)', async () => {
    const lucas = demo.referentiel.salaries.find((s) => s.id === LUCAS)!
    const avant = { entree: lucas.date_entree, sortie: lucas.date_sortie }
    lucas.date_entree = '2026-01-05'
    lucas.date_sortie = '2026-06-30'
    try {
      ouvrir(LUCAS)
      fireEvent.click(
        await screen.findByRole('button', { name: 'Ajouter un contrat' }),
      )
      const debut = screen.getByLabelText('Début')
      // Refusé : il commence pendant son contrat actuel.
      fireEvent.change(debut, { target: { value: '2026-06-01' } })
      fireEvent.click(
        screen.getByRole('button', { name: 'Ajouter le contrat' }),
      )
      expect(await screen.findByText(/recouvrent son contrat/)).toBeTruthy()
      expect(service.enregistrerSalarie).not.toHaveBeenCalled()
      // Accepté : trois mois après la fin, relié à ce contrat.
      fireEvent.change(debut, { target: { value: '2026-10-01' } })
      fireEvent.click(
        screen.getByRole('button', { name: 'Ajouter le contrat' }),
      )
      await waitFor(() => expect(service.enregistrerSalarie).toHaveBeenCalled())
      const [v, id] = service.enregistrerSalarie.mock.calls[0] as [
        Record<string, unknown>,
        number | null,
      ]
      expect(id).toBeNull()
      expect(v).toMatchObject({
        date_entree: '2026-10-01',
        date_sortie: null,
        suite_de: LUCAS,
        actif: true,
      })
    } finally {
      lucas.date_entree = avant.entree
      lucas.date_sortie = avant.sortie
    }
  })

  it('deux contrats : chaque ligne a sa suppression, et le bouton du bas dit « ce contrat »', async () => {
    const lucas = demo.referentiel.salaries.find((s) => s.id === LUCAS)!
    const avant = { entree: lucas.date_entree, sortie: lucas.date_sortie }
    lucas.date_entree = '2026-01-05'
    lucas.date_sortie = '2026-06-30'
    const suite = {
      ...structuredClone(lucas),
      id: 777,
      type_contrat: 'cdd' as const,
      date_entree: '2026-10-01',
      date_sortie: '2026-12-31',
      suite_de: LUCAS,
    }
    demo.referentiel.salaries.push(suite)
    try {
      etat.historique = { [LUCAS]: 40 }
      ouvrir(LUCAS)
      const corbeille = await screen.findByRole('button', {
        name: /Supprimer le contrat CDD du 01\/10\/2026/,
      })
      // Refusé : en bas, rien ne supprime la personne qui a travaillé.
      expect(
        screen.queryByRole('button', { name: /Supprimer la fiche/ }),
      ).toBeNull()
      // Refusé : le contrat qui a un historique ne se supprime pas.
      expect(
        screen.getByRole('button', {
          name: /Supprimer le contrat CDI du 05\/01\/2026/,
        }),
      ).toHaveProperty('disabled', true)
      await waitFor(() => expect(corbeille).toHaveProperty('disabled', false))
      fireEvent.click(corbeille)
      expect(
        await screen.findByText(/Supprimer le contrat CDD du 01\/10\/2026/),
      ).toBeTruthy()
      fireEvent.click(
        screen.getByRole('button', { name: 'Supprimer le contrat' }),
      )
      await waitFor(() =>
        expect(service.supprimerSalarie).toHaveBeenCalledWith(777),
      )
    } finally {
      demo.referentiel.salaries.splice(
        demo.referentiel.salaries.indexOf(suite),
        1,
      )
      lucas.date_entree = avant.entree
      lucas.date_sortie = avant.sortie
    }
  })

  it('embaucher un extra : son contrat d’extra s’arrête la veille du nouveau', async () => {
    const lucas = demo.referentiel.salaries.find((s) => s.id === LUCAS)!
    const avant = { ...lucas }
    Object.assign(lucas, {
      type_contrat: 'extra',
      heures_hebdo: 0,
      date_entree: '2026-03-01',
      date_sortie: null,
    })
    try {
      ouvrir(LUCAS)
      fireEvent.click(
        await screen.findByRole('button', { name: 'Ajouter un contrat' }),
      )
      fireEvent.change(screen.getByLabelText('Type de contrat'), {
        target: { value: 'cdi' },
      })
      fireEvent.change(screen.getByLabelText('Début'), {
        target: { value: '2026-12-01' },
      })
      fireEvent.click(
        screen.getByRole('button', { name: 'Ajouter le contrat' }),
      )
      await waitFor(() =>
        expect(service.enregistrerSalarie).toHaveBeenCalledTimes(2),
      )
      const [[extra, idExtra], [cdi, idCdi]] = service.enregistrerSalarie.mock
        .calls as [Record<string, unknown>, number | null][]
      expect(idExtra).toBe(LUCAS)
      expect(extra).toMatchObject({
        type_contrat: 'extra',
        date_sortie: '2026-11-30',
      })
      expect(idCdi).toBeNull()
      expect(cdi).toMatchObject({ date_entree: '2026-12-01', suite_de: LUCAS })
    } finally {
      Object.assign(lucas, avant)
    }
  })

  it('une fiche qui a servi ne se supprime pas ; créée par erreur, si', async () => {
    etat.historique = { [LUCAS]: 12 }
    ouvrir(LUCAS)
    await screen.findByRole('button', { name: 'Enregistrer' })
    expect(
      screen.queryByRole('button', { name: /Supprimer la fiche/ }),
    ).toBeNull()
  })

  it('supprimer demande confirmation puis appelle le service', async () => {
    ouvrir(LUCAS)
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Supprimer la fiche créée par erreur/,
      }),
    )
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
  }, 20_000)

  it('le bloc École dit qu’un jour d’école est une journée complète, sans durée à régler', async () => {
    ouvrir(11)
    await screen.findByText(
      "Un jour d'école compte comme une journée de travail complète.",
    )
    expect(screen.queryByLabelText(/journée d'école compte/)).toBeNull()
  })

  it('pas de bloc École sur la fiche d’un CDI', async () => {
    ouvrir(LUCAS)
    await screen.findByLabelText('Nom')
    expect(
      screen.queryByText(
        "Un jour d'école compte comme une journée de travail complète.",
      ),
    ).toBeNull()
  })

  it('le bloc École : appuyer sur un jour, relâcher sur un autre prend la plage ; Échap abandonne, Défaire revient en arrière', async () => {
    ouvrir(11)
    const jour = (nom: RegExp) => screen.getByRole('button', { name: nom })
    const ecole = () =>
      document.querySelectorAll('.planning-ecole [data-ecole]').length
    await screen.findByRole('region', { name: 'École' })
    const souris = { pointerType: 'mouse', button: 0 }
    // Du vendredi 27 au lundi 16 novembre, à l'envers : 10 jours.
    fireEvent.pointerDown(jour(/^ven\. 27 nov\. 2026/), souris)
    fireEvent.pointerEnter(jour(/^mer\. 18 nov\. 2026/), souris)
    fireEvent.pointerEnter(jour(/^lun\. 16 nov\. 2026/), souris)
    expect(screen.getByText(/10 jours passent à l'école/)).toBeTruthy()
    fireEvent.pointerUp(window, souris)
    expect(ecole()).toBe(10)
    // Un geste abandonné par Échap ne change rien.
    fireEvent.pointerDown(jour(/^lun\. 7 déc\. 2026/), souris)
    fireEvent.pointerEnter(jour(/^ven\. 11 déc\. 2026/), souris)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(window, souris)
    expect(ecole()).toBe(10)
    // Partir d'un jour d'école retire la plage.
    fireEvent.pointerDown(jour(/^mar\. 17 nov\. 2026/), souris)
    fireEvent.pointerEnter(jour(/^jeu\. 19 nov\. 2026/), souris)
    expect(screen.getByText(/3 jours reviennent à l'hôtel/)).toBeTruthy()
    fireEvent.pointerUp(window, souris)
    expect(ecole()).toBe(7)
    // Défaire revient sur le dernier geste, puis sur le premier.
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Défaire le dernier changement du calendrier',
      }),
    )
    expect(ecole()).toBe(10)
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Défaire le dernier changement du calendrier',
      }),
    )
    expect(ecole()).toBe(0)
    // Maj + clic : la plage depuis le dernier jour touché.
    fireEvent.click(jour(/^lun\. 4 janv\. 2027/))
    fireEvent.click(jour(/^ven\. 8 janv\. 2027/), { shiftKey: true })
    expect(ecole()).toBe(5)
  }, 20_000)

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
  }, 20_000)

  it('aperçu des règles : suit le contrat', async () => {
    ouvrir(LUCAS)
    const regles = await screen.findByRole('list', {
      name: 'Règles HCR appliquées',
    })
    // Le code de la règle n'est plus montré, même au survol (audit RH du
    // 2026-11-01) : il reste dans `data-regle` pour les tests.
    const codes = () =>
      [
        ...screen
          .getByRole('list', { name: 'Règles HCR appliquées' })
          .querySelectorAll('li'),
      ].map((li) => li.dataset.regle ?? '')
    expect(regles.textContent).not.toContain('R-SEMAINE-MAX')
    expect(codes()).toContain('R-SEMAINE-MAX')
    expect(codes()).not.toContain('R-NUIT-MINEUR')
    // Un CDI est majeur : pas d'interrupteur Mineur (2026-11-01).
    expect(screen.queryByLabelText('Mineur (16-18 ans)')).toBeNull()
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
      await screen.findByRole('button', {
        name: /Changer de poste ou de contrat/,
      }),
    )
    fireEvent.change(screen.getByLabelText('À partir du'), {
      target: { value: '2027-01-04' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Prévoir ce changement' }),
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

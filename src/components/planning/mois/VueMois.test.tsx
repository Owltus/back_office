// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'
import type * as ModPlanning from '#/components/planning/hooks/usePlanning.ts'
import type * as ModSemaine from '#/lib/planning/semaine.ts'
import { analyser } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import type { Affectation, Referentiel } from '#/lib/planning/types.ts'

/*
 * Vue mois contre un service et des hooks simulés (aucune base). Mois de
 * novembre 2026, aujourd'hui le mercredi 4 : semaines du 26/10 (passée),
 * 02/11 (en cours), 09/11, 16/11, 23/11 et 30/11.
 * Oracles : en lecture, aucune commande d'écriture active ; « Compléter le
 * mois » génère chaque semaine ouverte UNE fois, dans l'ordre, en sautant la
 * passée, la verrouillée et celles d'avant le dernier planning réalisé ;
 * l'effacement de masse demande confirmation.
 */

const AUJOURDHUI = '2026-11-04'
const demo = hotelDemo('2026-11-09')
let referentiel: Referentiel = demo.referentiel
let affectations: Affectation[] = []
let droits = { pret: true, lire: true, ecrire: false, gerer: false }

const service = vi.hoisted(() => ({
  fetchShifts: vi.fn(),
  valider: vi.fn(() => Promise.resolve(0)),
  vider: vi.fn((_lundi: string, _garder: boolean) => Promise.resolve(0)),
  verrouiller: vi.fn((_lundi: string, _verrou: boolean) => Promise.resolve()),
  ajouterShift: vi.fn(() => Promise.resolve()),
  modifierShift: vi.fn(() => Promise.resolve()),
  supprimerShift: vi.fn(() => Promise.resolve()),
  poserAbsences: vi.fn(() => Promise.resolve()),
  deplacerStatut: vi.fn(() => Promise.resolve()),
}))
const generer = vi.hoisted(() => vi.fn())

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/planning/service.ts', () => service)
vi.mock('#/components/planning/parametres/FicheSalarie.tsx', () => ({
  FicheSalarie: () => null,
}))
// Les horaires fixes posés à l'ouverture ne sont pas l'objet de ces tests.
vi.mock('#/lib/planning/semaine.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof ModSemaine>()),
  aPoserFixes: () => new Set<number>(),
}))
vi.mock(
  '#/components/planning/hooks/usePlanning.ts',
  async (importOriginal) => {
    const vrai = await importOriginal<typeof ModPlanning>()
    const ecrire = async (action: () => Promise<unknown>) => {
      try {
        await action()
        return { ok: true }
      } catch {
        return { ok: false, message: 'refusé' }
      }
    }
    return {
      ...vrai,
      useDroitsPlanning: () => droits,
      useAujourdhui: () => AUJOURDHUI,
      useReferentiel: () => ({
        data: referentiel,
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      }),
      useEcriture: () => ecrire,
      useGenerer: () => generer,
    }
  },
)

const { VueMois } = await import('#/components/planning/mois/VueMois.tsx')
const { FilMessages } = await import('#/components/planning/Messages.tsx')

function monter() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <FilMessages>
          <VueMois mois="2026-11" onMois={vi.fn()} onSemaine={vi.fn()} />
        </FilMessages>
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

const charge = () =>
  screen.findByRole('button', { name: 'Ouvrir la semaine 45' })

beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView = () => {}
  Element.prototype.hasPointerCapture = () => false
  referentiel = demo.referentiel
  affectations = []
  service.fetchShifts.mockImplementation(() =>
    Promise.resolve({ affectations, absences: demo.absences }),
  )
  generer.mockImplementation((lundi: string) =>
    Promise.resolve({
      poses: 0,
      dureeMs: 1,
      semaine: analyser({
        lundi,
        referentiel,
        absences: demo.absences,
        affectations: [],
        avant: [],
        apres: [],
      }),
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// Rendu d'un mois entier (~450 cases) dans jsdom : lent sous la charge de la
// batterie complète, d'où un délai plus large que les 5 s par défaut.
describe('VueMois', { timeout: 20_000 }, () => {
  it('charge le mois en UNE lecture, semaines voisines comprises', async () => {
    droits = { pret: true, lire: true, ecrire: false, gerer: false }
    monter()
    await charge()
    expect(service.fetchShifts).toHaveBeenCalledTimes(1)
    expect(service.fetchShifts).toHaveBeenCalledWith(
      [
        '2026-10-19',
        '2026-10-26',
        '2026-11-02',
        '2026-11-09',
        '2026-11-16',
        '2026-11-23',
        '2026-11-30',
        '2026-12-07',
      ],
      '2026-10-19',
      '2026-12-13',
    )
    // Rangés par catégorie, une ligne par personne présente.
    expect(screen.getByText('Hôteliers')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Ouvrir la semaine 49' }),
    ).toBeTruthy()
  })

  it('en lecture, aucune commande d’écriture n’est active', async () => {
    droits = { pret: true, lire: true, ecrire: false, gerer: false }
    monter()
    await charge()
    for (const nom of [
      'Compléter le mois',
      'Autres actions',
      'Verrouiller le mois',
    ]) {
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: nom }).disabled,
      ).toBe(true)
    }
    // Aucun glisser possible.
    const glissables = document.querySelectorAll(
      '[aria-roledescription="draggable"]',
    )
    expect(glissables.length).toBeGreaterThan(0)
    for (const g of glissables)
      expect(g.getAttribute('aria-disabled')).toBe('true')
    expect(generer).not.toHaveBeenCalled()
  })

  it('« Compléter le mois » génère chaque semaine ouverte une fois, dans l’ordre', async () => {
    droits = { pret: true, lire: true, ecrire: true, gerer: false }
    monter()
    await charge()
    // Le cadenas reste à la gestion.
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Verrouiller le mois',
      }).disabled,
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Compléter le mois' }))
    await waitFor(() => expect(generer).toHaveBeenCalledTimes(5))
    expect(generer.mock.calls.map((c) => c[0])).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ])
    expect(await screen.findByText(/Mois (complet )?généré/)).toBeTruthy()
  })

  it('saute la semaine verrouillée et celles d’avant le dernier planning réalisé', async () => {
    droits = { pret: true, lire: true, ecrire: true, gerer: false }
    referentiel = { ...demo.referentiel, verrous: ['2026-11-09'] }
    monter()
    await charge()
    fireEvent.click(screen.getByRole('button', { name: 'Compléter le mois' }))
    await waitFor(() => expect(generer).toHaveBeenCalledTimes(3))
    expect(generer.mock.calls.map((c) => c[0])).toEqual([
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ])
    expect(await screen.findByText(/non touchées/)).toBeTruthy()
  })

  it('effacer les propositions du mois demande confirmation, puis vide chaque semaine ouverte', async () => {
    droits = { pret: true, lire: true, ecrire: true, gerer: false }
    affectations = [
      {
        id: 1,
        lundi: '2026-11-16',
        salarie_id: 3,
        poste_id: 2,
        jour: 0,
        horaire_id: 1,
        debut: '07:00',
        fin: '15:45',
        epinglee: false,
        court: false,
        pause: 45,
      },
    ]
    monter()
    await charge()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Autres actions' }), {
      key: 'Enter',
    })
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: /Effacer les propositions du mois/,
      }),
    )
    expect(
      await screen.findByText('Effacer les propositions du mois ?'),
    ).toBeTruthy()
    expect(service.vider).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Effacer' }))
    await waitFor(() => expect(service.vider).toHaveBeenCalledTimes(5))
    expect(service.vider.mock.calls.map((c) => c[0])).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ])
  })

  it('en gestion, le cadenas verrouille chaque semaine du mois', async () => {
    droits = { pret: true, lire: true, ecrire: true, gerer: true }
    referentiel = { ...demo.referentiel, verrous: ['2026-10-26'] }
    monter()
    await charge()
    fireEvent.click(screen.getByRole('button', { name: 'Verrouiller le mois' }))
    // Une confirmation nomme les semaines touchées, avant toute écriture.
    expect(await screen.findByText('Verrouiller le mois ?')).toBeTruthy()
    expect(screen.getByText(/S45, S46, S47, S48 et S49/)).toBeTruthy()
    expect(service.verrouiller).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Verrouiller' }))
    await waitFor(() => expect(service.verrouiller).toHaveBeenCalledTimes(5))
    // La semaine déjà verrouillée n'est pas reverrouillée.
    expect(service.verrouiller.mock.calls.map((c) => c[0])).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ])
  })

  it('journée étoile : début et fin recalculés pour chaque shift touché', async () => {
    droits = { pret: true, lire: true, ecrire: true, gerer: false }
    const base = {
      lundi: '2026-11-16',
      salarie_id: 3,
      poste_id: 2,
      horaire_id: 1,
      epinglee: true,
      pause: 45,
    }
    affectations = [
      { ...base, id: 1, jour: 0, debut: '07:00', fin: '15:45', court: false },
      { ...base, id: 2, jour: 2, debut: '07:00', fin: '14:45', court: true },
    ]
    monter()
    await charge()
    // Clic droit : le menu rapide (le clic ouvre l'éditeur complet).
    fireEvent.contextMenu(
      screen.getByRole('button', {
        name: /^Lucas Petit, .*16.* · Matin 07:00–15:45/,
      }),
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /Journée étoile/ }),
    )
    await waitFor(() => expect(service.modifierShift).toHaveBeenCalledTimes(2))
    // L'ancienne journée courte reprend ses heures pleines, la nouvelle les perd.
    expect(service.modifierShift).toHaveBeenNthCalledWith(1, 2, {
      court: false,
      debut: '07:00',
      fin: '15:45',
    })
    expect(service.modifierShift).toHaveBeenNthCalledWith(2, 1, {
      court: true,
      debut: '07:00',
      fin: '14:45',
    })
  })

  it('poser un horaire sur une absence : refusé, l’absence est remise', async () => {
    droits = { pret: true, lire: true, ecrire: true, gerer: false }
    const conges = demo.referentiel.motifs.find((m) => m.code === 'CP')!.id
    service.fetchShifts.mockImplementation(() =>
      Promise.resolve({
        affectations,
        absences: [
          ...demo.absences,
          { id: 999, salarie_id: 3, jour: '2026-11-18', motif_id: conges },
        ],
      }),
    )
    service.ajouterShift.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error('refus'), { code: 'PL400' })),
    )
    monter()
    await charge()
    fireEvent.contextMenu(
      screen.getByRole('button', { name: /^Lucas Petit, .*18.* : Congés/ }),
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: /Matin/ }))
    await waitFor(() => expect(service.poserAbsences).toHaveBeenCalledTimes(2))
    expect(service.poserAbsences).toHaveBeenNthCalledWith(
      1,
      3,
      ['2026-11-18'],
      null,
    )
    expect(service.poserAbsences).toHaveBeenNthCalledWith(
      2,
      3,
      ['2026-11-18'],
      conges,
    )
  })

  it('clic sur un jour : l’éditeur complet, date en toutes lettres, écrit dans la semaine du jour', async () => {
    droits = { pret: true, lire: true, ecrire: true, gerer: false }
    monter()
    await charge()
    fireEvent.click(
      screen.getByRole('button', {
        name: /^Lucas Petit, .*18.* · Non attribué/,
      }),
    )
    expect(await screen.findByText('Planifier le jour')).toBeTruthy()
    expect(screen.getByText(/mercredi 18 novembre 2026/)).toBeTruthy()
    // Une absence se pose aussi depuis la vue mois.
    fireEvent.click(screen.getByRole('button', { name: /Congés/ }))
    fireEvent.click(screen.getByRole('button', { name: "Poser l'absence" }))
    await waitFor(() => expect(service.poserAbsences).toHaveBeenCalledTimes(1))
    const conges = demo.referentiel.motifs.find((m) => m.code === 'CP')!.id
    expect(service.poserAbsences).toHaveBeenCalledWith(
      3,
      ['2026-11-18'],
      conges,
    )
  })

  it('clic sur un shift : l’éditeur complet, suppression en deux temps', async () => {
    droits = { pret: true, lire: true, ecrire: true, gerer: false }
    affectations = [
      {
        id: 7,
        lundi: '2026-11-23',
        salarie_id: 3,
        poste_id: 2,
        jour: 1,
        horaire_id: 1,
        debut: '07:00',
        fin: '15:45',
        epinglee: true,
        court: false,
        pause: 45,
      },
    ]
    monter()
    await charge()
    fireEvent.click(
      screen.getByRole('button', {
        name: /^Lucas Petit, .*24.* · Matin 07:00–15:45/,
      }),
    )
    expect(await screen.findByText('Modifier le shift')).toBeTruthy()
    expect(screen.getByText(/mardi 24 novembre 2026/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmer la suppression' }),
    )
    await waitFor(() => expect(service.supprimerShift).toHaveBeenCalledWith(7))
  })

  it('clic sur un jour d’une semaine verrouillée : rien ne s’ouvre', async () => {
    droits = { pret: true, lire: true, ecrire: true, gerer: true }
    referentiel = { ...demo.referentiel, verrous: ['2026-11-16'] }
    monter()
    await charge()
    fireEvent.click(
      screen.getByRole('button', {
        name: /^Lucas Petit, .*18.* · Non attribué/,
      }),
    )
    expect(await screen.findByText(/Semaine verrouillée/)).toBeTruthy()
    expect(screen.queryByText('Planifier le jour')).toBeNull()
  })

  it('arrêt d’une action du mois : la semaine est citée avant le message de la base', async () => {
    droits = { pret: true, lire: true, ecrire: true, gerer: false }
    generer.mockImplementationOnce(() =>
      Promise.reject(
        Object.assign(new Error('x'), {
          code: 'PL409',
          message: 'Le planning a changé entre-temps.',
        }),
      ),
    )
    monter()
    await charge()
    fireEvent.click(screen.getByRole('button', { name: 'Compléter le mois' }))
    expect(
      await screen.findByText(
        'Génération du mois : arrêt à la semaine S45 (du 02/11). Le planning a changé entre-temps.',
      ),
    ).toBeTruthy()
  })
})

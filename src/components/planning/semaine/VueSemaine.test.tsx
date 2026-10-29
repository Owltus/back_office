// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'
import { analyser } from '#/lib/planning/semaine.ts'
import type { DonneesSemaine } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import type { Affectation } from '#/lib/planning/types.ts'

/*
 * Vue semaine sur l'hôtel fictif, analysée pour de vrai (`analyser`), avec le
 * service et les hooks d'accès simulés : la base n'est pas touchée. Oracles :
 * en lecture aucun geste d'écriture n'est actif ; en écriture, Compléter
 * lance la génération et le + ouvre l'éditeur qui ajoute le shift ; en
 * gestion seulement, le cadenas verrouille (après confirmation).
 */

const LUNDI = '2026-11-02'

const service = vi.hoisted(() => ({
  ajouterShift: vi.fn(() => Promise.resolve()),
  modifierShift: vi.fn(() => Promise.resolve()),
  supprimerShift: vi.fn(() => Promise.resolve()),
  valider: vi.fn(() => Promise.resolve(0)),
  vider: vi.fn(() => Promise.resolve(0)),
  poserAbsences: vi.fn(() => Promise.resolve()),
  deplacerStatut: vi.fn(() => Promise.resolve()),
  verrouiller: vi.fn(() => Promise.resolve()),
}))
const etat = vi.hoisted(() => ({
  droits: { pret: true, lire: true, ecrire: false, gerer: false },
  generer: vi.fn(),
}))

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/planning/service.ts', () => service)
vi.mock('#/components/planning/EnTeteParametres.tsx', () => ({
  MenuParametres: () => null,
}))
vi.mock('#/components/planning/parametres/FicheSalarie.tsx', () => ({
  FicheSalarie: () => null,
}))

function donneesDemo(): DonneesSemaine {
  const { referentiel, absences } = hotelDemo(LUNDI)
  // Karim Benali (veille de nuit), lundi, une proposition du moteur.
  const nuit = referentiel.horaires.find((h) => h.code === 'N')!
  const poste = referentiel.postes.find((p) => p.nom === 'Veille de nuit')!
  const shift: Affectation = {
    id: 1,
    lundi: LUNDI,
    salarie_id: 2,
    poste_id: poste.id,
    jour: 0,
    horaire_id: nuit.id,
    debut: nuit.debut,
    fin: nuit.fin,
    epinglee: false,
    court: false,
    pause: nuit.pause,
  }
  return {
    lundi: LUNDI,
    referentiel,
    absences,
    affectations: [shift],
    avant: [],
    apres: [],
  }
}
const DONNEES = donneesDemo()
const SEMAINE = analyser(DONNEES)
// Ce que lit la vue : la semaine de démo, sauf pour les tests de démarrage.
const vue = vi.hoisted((): { donnees: unknown; semaine: unknown } => ({
  donnees: null,
  semaine: null,
}))
vue.donnees = DONNEES
vue.semaine = SEMAINE

vi.mock('#/components/planning/hooks/usePlanning.ts', async (original) => {
  const reel = await original<Record<string, unknown>>()
  return {
    ...reel,
    useDroitsPlanning: () => etat.droits,
    useAujourdhui: () => '2026-10-27',
    useSemaine: () => ({
      referentiel: (vue.donnees as DonneesSemaine).referentiel,
      donnees: vue.donnees,
      semaine: vue.semaine,
      isPending: false,
      isError: false,
      refetch: () => Promise.resolve([]),
    }),
    useEcriture: () => async (action: () => Promise<unknown>) => {
      await action()
      return { ok: true }
    },
    useGenerer: () => etat.generer,
    usePoserFixes: () => {},
  }
})

const { VueSemaine } =
  await import('#/components/planning/semaine/VueSemaine.tsx')
const { FilMessages } = await import('#/components/planning/Messages.tsx')

function rendre() {
  return render(
    <TooltipProvider>
      <FilMessages>
        <VueSemaine lundi={LUNDI} onLundi={() => {}} onMois={() => {}} />
      </FilMessages>
    </TooltipProvider>,
  )
}

const bouton = (nom: string | RegExp) =>
  screen.getByRole('button', { name: nom })

beforeEach(() => {
  etat.generer = vi.fn(() =>
    Promise.resolve({ poses: 3, dureeMs: 12, semaine: SEMAINE }),
  )
  for (const f of Object.values(service)) f.mockClear()
  vue.donnees = DONNEES
  vue.semaine = SEMAINE
})

/** La démo avec des réglages retouchés (et, au choix, sans shift). */
function avecReglages(
  retouche: Partial<DonneesSemaine['referentiel']>,
  sansShift = false,
) {
  const d: DonneesSemaine = {
    ...DONNEES,
    referentiel: { ...DONNEES.referentiel, ...retouche },
    affectations: sansShift ? [] : DONNEES.affectations,
  }
  vue.donnees = d
  vue.semaine = analyser(d)
}
afterEach(cleanup)

describe('VueSemaine', () => {
  it('affiche la semaine : en-tête, staff, carte du shift', () => {
    etat.droits = { pret: true, lire: true, ecrire: false, gerer: false }
    rendre()
    expect(screen.getByRole('heading', { name: /Semaine 45/ })).toBeTruthy()
    expect(bouton(/Ouvrir la fiche de Karim Benali/)).toBeTruthy()
    // Proposition : la carte porte ses heures et son état.
    expect(
      screen.getByRole('button', { name: /Nuit · 23:00-07:45/ }),
    ).toBeTruthy()
    expect(screen.getByText(/1 proposition/)).toBeTruthy()
  })

  it('lecture : aucun geste d’écriture actif', () => {
    etat.droits = { pret: true, lire: true, ecrire: false, gerer: false }
    rendre()
    expect(
      (bouton('Compléter le planning') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect((bouton('Autres actions') as HTMLButtonElement).disabled).toBe(true)
    expect(
      (bouton('Verrouiller la semaine') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      screen.queryAllByRole('button', { name: 'Ajouter un shift' }),
    ).toHaveLength(0)
    expect(
      screen.queryAllByRole('button', { name: /^Valider le / }),
    ).toHaveLength(0)
    const carte = screen.getByRole('button', { name: /Nuit · 23:00-07:45/ })
    expect(carte.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(carte)
    expect(screen.queryByText('Modifier le shift')).toBeNull()
    // Lire reste possible : fiche, alertes, navigation.
    expect(
      (bouton(/Ouvrir la fiche de Karim Benali/) as HTMLButtonElement).disabled,
    ).toBe(false)
    expect((bouton(/Points d'attention/) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  it('écriture : Compléter lance la génération et dit le résultat', async () => {
    etat.droits = { pret: true, lire: true, ecrire: true, gerer: false }
    rendre()
    // Le cadenas reste réservé à la gestion.
    expect(
      (bouton('Verrouiller la semaine') as HTMLButtonElement).disabled,
    ).toBe(true)
    fireEvent.click(bouton('Compléter le planning'))
    // L'hôtel fictif a des points à voir : la génération les montre d'abord.
    expect(etat.generer).not.toHaveBeenCalled()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Générer quand même' }),
    )
    await waitFor(() => expect(etat.generer).toHaveBeenCalledWith(LUNDI, {}))
    const n = SEMAINE.a_pourvoir.reduce((t, x) => t + x.manquant, 0)
    // Le bouchon de `generer` rend 3 shifts posés.
    expect(
      await screen.findByText(
        n === 0
          ? 'Planning complet généré. 3 shifts proposés.'
          : n === 1
            ? 'Planning généré. 3 shifts proposés. 1 place reste à pourvoir.'
            : `Planning généré. 3 shifts proposés. ${n} places restent à pourvoir.`,
      ),
    ).toBeTruthy()
  })

  it('places restées vides : le message de fin reste jusqu’à ce qu’on le ferme', async () => {
    etat.droits = { pret: true, lire: true, ecrire: true, gerer: false }
    const n = SEMAINE.a_pourvoir.reduce((t, x) => t + x.manquant, 0)
    expect(n).toBeGreaterThan(0)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      rendre()
      fireEvent.click(bouton('Compléter le planning'))
      fireEvent.click(
        await screen.findByRole('button', { name: 'Générer quand même' }),
      )
      const texte = await screen.findByText(
        /^Planning généré. 3 shifts proposés/,
      )
      await act(async () => {
        vi.advanceTimersByTime(60_000)
        await Promise.resolve()
      })
      expect(texte.isConnected).toBe(true)
      const message = texte.closest('div.pointer-events-auto') as HTMLElement
      fireEvent.click(
        within(message).getByRole('button', { name: 'Fermer le message' }),
      )
      expect(
        screen.queryByText(/^Planning généré. 3 shifts proposés/),
      ).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('écriture : le + ouvre l’éditeur, qui ajoute un shift validé', async () => {
    etat.droits = { pret: true, lire: true, ecrire: true, gerer: false }
    rendre()
    const plus = screen.getAllByRole('button', { name: 'Ajouter un shift' })
    expect(plus.length).toBeGreaterThan(0)
    fireEvent.click(plus[0])
    const tiroir = await screen.findByRole('dialog')
    expect(within(tiroir).getByText('Planifier le jour')).toBeTruthy()
    fireEvent.click(
      within(tiroir).getByRole('button', { name: 'Ajouter le shift' }),
    )
    await waitFor(() => expect(service.ajouterShift).toHaveBeenCalledTimes(1))
    const [lundi, shift] = service.ajouterShift.mock.calls[0] as unknown as [
      string,
      { epinglee: boolean },
    ]
    expect(lundi).toBe(LUNDI)
    expect(shift.epinglee).toBe(true)
  })

  it('écriture : valider le jour appelle la validation du lundi', async () => {
    etat.droits = { pret: true, lire: true, ecrire: true, gerer: false }
    rendre()
    fireEvent.click(bouton('Valider le lundi'))
    await waitFor(() =>
      expect(service.valider).toHaveBeenCalledWith(LUNDI, null, 0, true),
    )
  })

  it('gestion : le cadenas verrouille après confirmation', async () => {
    etat.droits = { pret: true, lire: true, ecrire: true, gerer: true }
    rendre()
    const cadenas = bouton('Verrouiller la semaine') as HTMLButtonElement
    expect(cadenas.disabled).toBe(false)
    fireEvent.click(cadenas)
    const dialogue = await screen.findByRole('dialog')
    fireEvent.click(
      within(dialogue).getByRole('button', { name: 'Verrouiller' }),
    )
    await waitFor(() =>
      expect(service.verrouiller).toHaveBeenCalledWith(LUNDI, true),
    )
    expect(await screen.findByText('Semaine verrouillée')).toBeTruthy()
  })

  it('droits non lus : tout est grisé', () => {
    etat.droits = { pret: false, lire: false, ecrire: false, gerer: false }
    rendre()
    expect(
      (bouton('Compléter le planning') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      screen.queryAllByRole('button', { name: 'Ajouter un shift' }),
    ).toHaveLength(0)
  })

  it('les points de compétence portent une infobulle Poste · niveau', async () => {
    etat.droits = { pret: true, lire: true, ecrire: false, gerer: false }
    rendre()
    const point = screen.getAllByRole('img', { name: /^Veille de nuit · / })[0]
    // Déclencheur d'infobulle (Tip), pas d'attribut title natif.
    expect(point.getAttribute('data-slot')).toBe('tooltip-trigger')
    expect(point.getAttribute('title')).toBeNull()
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    fireEvent.pointerMove(point, { pointerType: 'mouse' })
    expect(
      (
        await screen.findAllByText(
          /^Veille de nuit · (Titulaire|Dépannage|Soutien)$/,
          {},
          { timeout: 3000 },
        )
      ).length,
    ).toBeGreaterThan(0)
  })

  describe('prêt à générer (étape 7)', () => {
    const VIDE = { horaires: [], postes: [], salaries: [], besoins: [] }

    it('référentiel vide : la carte Pour commencer remplace la grille, Compléter grisé avec sa raison', () => {
      etat.droits = { pret: true, lire: true, ecrire: true, gerer: true }
      avecReglages({ ...VIDE, consignes: [] }, true)
      rendre()
      expect(
        screen.getByRole('heading', { name: 'Pour commencer' }),
      ).toBeTruthy()
      expect(
        screen.queryAllByRole('button', { name: 'Ajouter un shift' }),
      ).toHaveLength(0)
      const completer = bouton('Compléter le planning') as HTMLButtonElement
      expect(completer.disabled).toBe(true)
      // La raison est lue sans survol : description accessible.
      const id = completer.getAttribute('aria-describedby')!
      expect(document.getElementById(id)?.textContent).toMatch(
        /^Génération impossible, un réglage manque : Aucun code horaire/,
      )
      fireEvent.click(completer)
      expect(etat.generer).not.toHaveBeenCalled()
    })

    it('planning déjà rempli : la grille reste, un bandeau dit ce qui manque', () => {
      etat.droits = { pret: true, lire: true, ecrire: true, gerer: false }
      avecReglages({ besoins: [] })
      rendre()
      expect(screen.queryByRole('heading', { name: 'Pour commencer' })).toBe(
        null,
      )
      expect(
        screen.getByRole('button', { name: /Nuit · 23:00-07:45/ }),
      ).toBeTruthy()
      expect(
        screen
          .getAllByRole('status')
          .some((s) => /Aucun besoin/.test(s.textContent)),
      ).toBe(true)
      expect(
        (bouton('Compléter le planning') as HTMLButtonElement).disabled,
      ).toBe(true)
    })

    it('seed prêt : Compléter actif, sans description de blocage ; Annuler ne génère pas', async () => {
      etat.droits = { pret: true, lire: true, ecrire: true, gerer: false }
      rendre()
      const completer = bouton('Compléter le planning') as HTMLButtonElement
      expect(completer.disabled).toBe(false)
      expect(completer.getAttribute('aria-describedby')).toBeNull()
      fireEvent.click(completer)
      const dialogue = await screen.findByRole('dialog')
      expect(
        within(dialogue).getByText(/3 points à vérifier dans les réglages/),
      ).toBeTruthy()
      fireEvent.click(within(dialogue).getByRole('button', { name: 'Annuler' }))
      expect(etat.generer).not.toHaveBeenCalled()
    })

    it('liste acceptée : le clic suivant génère sans redemander', async () => {
      etat.droits = { pret: true, lire: true, ecrire: true, gerer: false }
      rendre()
      fireEvent.click(bouton('Compléter le planning'))
      fireEvent.click(
        await screen.findByRole('button', { name: 'Générer quand même' }),
      )
      await waitFor(() => expect(etat.generer).toHaveBeenCalledTimes(1))
      await waitFor(() =>
        expect(
          (bouton('Compléter le planning') as HTMLButtonElement).disabled,
        ).toBe(false),
      )
      fireEvent.click(bouton('Compléter le planning'))
      await waitFor(() => expect(etat.generer).toHaveBeenCalledTimes(2))
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('aucun point à voir : la génération part directement', async () => {
      etat.droits = { pret: true, lire: true, ecrire: true, gerer: false }
      // Les points à voir de la démo portent sur les apprentis : sans besoin
      // de soutien, il n'en reste aucun.
      avecReglages({
        besoins: DONNEES.referentiel.besoins.map((b) => ({ ...b, soutien: 0 })),
      })
      rendre()
      fireEvent.click(bouton('Compléter le planning'))
      await waitFor(() => expect(etat.generer).toHaveBeenCalledTimes(1))
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})

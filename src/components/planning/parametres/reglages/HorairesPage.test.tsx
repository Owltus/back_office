// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'

import type { Referentiel } from '#/lib/planning/types.ts'

/*
 * Horaires et absences contre un service simulé (la base n'est pas touchée).
 * Vérifié : en lecture, rien n'est modifiable ; rien ne part à la frappe ;
 * Enregistrer envoie l'horaire complet, sans code, avec le nom écrit par
 * l'app ; le moment est proposé d'après les heures puis gardé s'il est
 * choisi à la main ; deux horaires aux mêmes heures sont refusés avant
 * l'envoi ; une pause plus longue que l'horaire est refusée avec le message,
 * sans appel ; un refus de la base à la suppression s'affiche en clair.
 */

const etat = vi.hoisted(() => ({
  droits: { pret: true, lire: true, ecrire: true, gerer: true },
  referentiel: null as Referentiel | null,
}))
const service = vi.hoisted(() => ({
  enregistrerHoraire: vi.fn(),
  enregistrerMotif: vi.fn(),
  supprimerHoraire: vi.fn(),
  supprimerMotif: vi.fn(),
}))

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
const absences = vi.hoisted(() => ({
  compterAbsencesParMotif: vi.fn(),
}))
vi.mock(
  '#/components/planning/parametres/reglages/absencesParMotif.ts',
  async (original) => ({
    ...(await original<Record<string, unknown>>()),
    compterAbsencesParMotif: absences.compterAbsencesParMotif,
  }),
)
vi.mock('#/lib/planning/service.ts', () => service)
vi.mock('#/components/planning/EnTeteParametres.tsx', () => ({
  MenuParametres: () => null,
  RetourPlanning: () => null,
}))
vi.mock('#/components/planning/hooks/usePlanning.ts', async () => {
  const { messageErreur } = await import('#/lib/planning/erreurs.ts')
  return {
    useDroitsPlanning: () => etat.droits,
    useReferentiel: () => ({
      data: etat.referentiel,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useEcriture:
      () => async (action: () => Promise<unknown>, echec?: string) => {
        try {
          await action()
          return { ok: true }
        } catch (err) {
          return { ok: false, message: messageErreur(err, echec) }
        }
      },
  }
})

const { HorairesPage } =
  await import('#/components/planning/parametres/HorairesPage.tsx')
const { monter, referentielDemo } =
  await import('#/components/planning/parametres/reglages/test/monter.tsx')

beforeEach(() => {
  // Le volet (Radix) mesure ses éléments : jsdom n'a pas ResizeObserver.
  if (!('ResizeObserver' in globalThis))
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  etat.referentiel = referentielDemo()
  etat.droits = { pret: true, lire: true, ecrire: true, gerer: true }
  for (const f of Object.values(service)) f.mockReset()
  service.enregistrerHoraire.mockResolvedValue(1)
  absences.compterAbsencesParMotif.mockReset()
  absences.compterAbsencesParMotif.mockResolvedValue([])
})
afterEach(cleanup)

// Les horaires et les motifs sont des lignes compactes ; un clic ouvre leur
// réglage dans un volet (refonte du 2026-10-28).
const ouvrir = (nom: RegExp) => {
  const ligne = [
    ...document.querySelectorAll<HTMLButtonElement>('button[aria-label]'),
  ].find((x) => nom.test(x.getAttribute('aria-label') ?? ''))
  if (!ligne) throw new Error(`Aucune ligne ${nom}`)
  fireEvent.click(ligne)
}
// L'horaire M de l'hôtel fictif se lit par ses heures.
const carteMatin = () => {
  if (!screen.queryByRole('region', { name: 'Horaire 07:00–15:45' }))
    ouvrir(/^Régler l'horaire 07:00–15:45$/)
  return screen.getByRole('region', { name: 'Horaire 07:00–15:45' })
}
const carteNouvelle = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Nouvel horaire' }))
  return screen.getByRole('region', { name: 'Nouvel horaire' })
}
const carteMaladie = () => {
  if (!screen.queryByRole('region', { name: 'Motif Maladie' }))
    ouvrir(/^Régler .*, Maladie$/)
  return screen.getByRole('region', { name: 'Motif Maladie' })
}

describe('Horaires et absences', () => {
  it('en lecture (ou écriture) : tout se lit, rien ne se modifie', () => {
    etat.droits = { pret: true, lire: true, ecrire: true, gerer: false }
    monter(<HorairesPage />)
    expect(screen.getByText(/Lecture seule/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Nouveau/ })).toBeNull()
    carteMatin()
    for (const champ of screen.getAllByRole('textbox')) {
      expect((champ as HTMLInputElement).disabled).toBe(true)
    }
    for (const champ of screen.getAllByRole('spinbutton')) {
      expect((champ as HTMLInputElement).disabled).toBe(true)
    }
    expect(
      screen.queryByRole('button', { name: /Nouveau|Supprimer|Enregistrer/ }),
    ).toBeNull()
    for (const b of screen.getAllByRole('button', { name: /^Couleur/ })) {
      expect((b as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it("rien ne part à la frappe ; Enregistrer envoie l'horaire complet, sans code", async () => {
    monter(<HorairesPage />)
    const carte = within(carteMatin())
    fireEvent.change(carte.getByLabelText('Pause en minutes'), {
      target: { value: '30' },
    })
    fireEvent.change(carte.getByLabelText('Fin'), {
      target: { value: '15:30' },
    })
    fireEvent.click(carte.getByRole('radio', { name: 'Matin' }))
    // Plus d'option « heures écrites en rouge » (2026-10-31).
    expect(carte.queryByRole('switch', { name: /rouge/i })).toBeNull()
    expect(service.enregistrerHoraire).not.toHaveBeenCalled()
    expect(
      carte.getByText(
        /les shifts déjà posés avec cet horaire prennent\s+ces heures/,
      ),
    ).toBeTruthy()
    fireEvent.click(carte.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(service.enregistrerHoraire).toHaveBeenCalledTimes(1),
    )
    expect(service.enregistrerHoraire).toHaveBeenCalledWith(
      {
        nom: 'Matin de 7 h à 15 h 30',
        debut: '07:00',
        fin: '15:30',
        couleur: '#000000',
        pause: 30,
        periode: 'matin',
      },
      1,
    )
    expect(
      await screen.findByText(
        /Les shifts à venir posés avec cet horaire ont suivi/,
      ),
    ).toBeTruthy()
  })

  it("refuse une pause plus longue que l'horaire, avec le message", () => {
    monter(<HorairesPage />)
    const carte = within(carteMatin())
    fireEvent.change(carte.getByLabelText('Fin'), {
      target: { value: '07:30' },
    })
    expect(
      carte.getByText("La pause doit être plus courte que l'horaire."),
    ).toBeTruthy()
    const bouton = carte.getByRole<HTMLButtonElement>('button', {
      name: 'Enregistrer',
    })
    expect(bouton.disabled).toBe(true)
    fireEvent.click(bouton)
    expect(service.enregistrerHoraire).not.toHaveBeenCalled()
  })

  it("plus de minutes en moins : l'aperçu dit les horaires de 7 h compris dans celui-ci", () => {
    monter(<HorairesPage />)
    const carte = within(carteMatin())
    // Le réglage qui retirait une heure a disparu (2026-11-02).
    expect(carte.queryByLabelText(/minutes en moins/)).toBeNull()
    expect(carte.queryByLabelText('Minutes retirées au début')).toBeNull()
    const apercu = within(carte.getByLabelText('Aperçu des heures'))
    expect(apercu.getByText('Journée normale')).toBeTruthy()
    expect(apercu.getByText(/07:00 → 15:45 · 8h de travail/)).toBeTruthy()
    // Ses versions étoile, des horaires qui existent (`versionsEtoile`).
    expect(apercu.getByText('Journée étoile')).toBeTruthy()
    expect(apercu.getByText('08:00–15:45, 07:00–14:45')).toBeTruthy()
    // Un horaire de 8 h sans version : dit aussi.
    fireEvent.change(carte.getByLabelText('Début'), {
      target: { value: '05:00' },
    })
    fireEvent.change(carte.getByLabelText('Fin'), {
      target: { value: '13:45' },
    })
    expect(
      apercu.getByText('aucun horaire de 7 h contenu dans celui-ci'),
    ).toBeTruthy()
  })

  it('un horaire de 7 h dit de quel horaire il est la journée étoile', () => {
    monter(<HorairesPage />)
    // Sa ligne le dit, et son aperçu nomme l'horaire de 8 h.
    const ligne = (libelle: string) =>
      screen.getByRole('button', { name: `Régler l'horaire ${libelle}` })
    expect(
      within(ligne('07:00–14:45')).getByText(
        '7h · pause 45 min · journée étoile',
      ),
    ).toBeTruthy()
    // L'horaire de 8 h, lui, n'est la journée étoile d'aucun autre.
    expect(
      within(ligne('07:00–15:45')).getByText('8h · pause 45 min'),
    ).toBeTruthy()
    ouvrir(/^Régler l'horaire 07:00–14:45$/)
    const apercu = within(
      within(
        screen.getByRole('region', { name: 'Horaire 07:00–14:45' }),
      ).getByLabelText('Aperçu des heures'),
    )
    expect(apercu.getByText('Heures')).toBeTruthy()
    expect(apercu.getByText('Journée étoile de')).toBeTruthy()
    expect(apercu.getByText('07:00–15:45')).toBeTruthy()
  })

  it('un nouvel horaire : ni code ni nom à saisir, créé à Enregistrer seulement', async () => {
    monter(<HorairesPage />)
    const carte = within(carteNouvelle())
    expect(service.enregistrerHoraire).not.toHaveBeenCalled()
    expect(carte.queryByLabelText('Code court')).toBeNull()
    expect(carte.queryByLabelText("Nom de l'horaire")).toBeNull()
    // 09:00-17:45 est déjà pris dans l'hôtel fictif : la page propose
    // l'heure pleine suivante, libre.
    expect(carte.getByLabelText<HTMLInputElement>('Début').value).toBe('10:00')
    expect(carte.getByLabelText<HTMLInputElement>('Fin').value).toBe('18:45')
    fireEvent.click(carte.getByRole('button', { name: "Créer l'horaire" }))
    await waitFor(() =>
      expect(service.enregistrerHoraire).toHaveBeenCalledTimes(1),
    )
    const [valeurs, id] = service.enregistrerHoraire.mock.calls[0]
    expect(id).toBeNull()
    expect('code' in valeurs).toBe(false)
    expect(valeurs.periode).toBe('middle')
    expect(valeurs.nom).toBe('Middle de 10 h à 18 h 45')
  })

  it("le moment est proposé d'après les heures, puis gardé quand on le choisit", async () => {
    monter(<HorairesPage />)
    const carte = within(carteNouvelle())
    const coche = (nom: string) =>
      carte.getByRole('radio', { name: nom }).getAttribute('aria-checked')
    expect(coche('Middle')).toBe('true')
    expect(carte.getByText("Proposé d'après les heures.")).toBeTruthy()
    // Les heures changent : le moment suit.
    fireEvent.change(carte.getByLabelText('Début'), {
      target: { value: '23:00' },
    })
    fireEvent.change(carte.getByLabelText('Fin'), {
      target: { value: '07:45' },
    })
    expect(coche('Nuit')).toBe('true')
    expect(carte.getByText("Proposé d'après les heures.")).toBeTruthy()
    // Choisi à la main : la phrase s'en va, et le moment ne bouge plus.
    fireEvent.click(carte.getByRole('radio', { name: 'Soir' }))
    expect(carte.queryByText("Proposé d'après les heures.")).toBeNull()
    fireEvent.change(carte.getByLabelText('Début'), {
      target: { value: '06:00' },
    })
    fireEvent.change(carte.getByLabelText('Fin'), {
      target: { value: '14:45' },
    })
    expect(coche('Soir')).toBe('true')
    fireEvent.click(carte.getByRole('button', { name: "Créer l'horaire" }))
    await waitFor(() =>
      expect(service.enregistrerHoraire).toHaveBeenCalledTimes(1),
    )
    expect(service.enregistrerHoraire.mock.calls[0][0].periode).toBe('soir')
  })

  it('horaire existant : un moment choisi à la main est gardé quand les heures changent', () => {
    // Oracle : décision utilisateur du 2026-10-31 (proposé, puis modifiable).
    // 07:00-15:45 est proposé « Matin » ; rangé en Soir, c'est un choix.
    const avecMoment = (periode: 'matin' | 'soir') => {
      const ref = referentielDemo()
      etat.referentiel = {
        ...ref,
        horaires: ref.horaires.map((h) => (h.id === 1 ? { ...h, periode } : h)),
      }
    }
    avecMoment('soir')
    monter(<HorairesPage />)
    let carte = within(carteMatin())
    fireEvent.change(carte.getByLabelText('Fin'), {
      target: { value: '15:30' },
    })
    expect(
      carte.getByRole('radio', { name: 'Soir' }).getAttribute('aria-checked'),
    ).toBe('true')
    cleanup()

    // Rangé comme la proposition : il suit les heures.
    avecMoment('matin')
    monter(<HorairesPage />)
    carte = within(carteMatin())
    fireEvent.change(carte.getByLabelText('Début'), {
      target: { value: '15:00' },
    })
    fireEvent.change(carte.getByLabelText('Fin'), {
      target: { value: '23:45' },
    })
    expect(
      carte.getByRole('radio', { name: 'Soir' }).getAttribute('aria-checked'),
    ).toBe('true')
  })

  it("deux horaires aux mêmes heures : refusé avant l'envoi", () => {
    monter(<HorairesPage />)
    const carte = within(carteNouvelle())
    fireEvent.change(carte.getByLabelText('Début'), {
      target: { value: '07:00' },
    })
    fireEvent.change(carte.getByLabelText('Fin'), {
      target: { value: '15:45' },
    })
    expect(carte.getByText('Cet horaire existe déjà.')).toBeTruthy()
    const bouton = carte.getByRole<HTMLButtonElement>('button', {
      name: "Créer l'horaire",
    })
    expect(bouton.disabled).toBe(true)
    fireEvent.click(bouton)
    expect(service.enregistrerHoraire).not.toHaveBeenCalled()
  })

  it('montre le refus de la base à la suppression', async () => {
    service.supprimerHoraire.mockRejectedValue({
      code: 'PL409',
      message: 'Cet horaire est le seul permis pour le poste Accueil.',
    })
    monter(<HorairesPage />)
    fireEvent.click(
      within(carteMatin()).getByRole('button', { name: 'Supprimer' }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))
    await waitFor(() =>
      expect(service.supprimerHoraire).toHaveBeenCalledWith(1),
    )
    expect(
      await screen.findByText(
        'Cet horaire est le seul permis pour le poste Accueil.',
      ),
    ).toBeTruthy()
  })

  it('motif : nature et compté dans les heures, envoyés à Enregistrer', async () => {
    service.enregistrerMotif.mockResolvedValue(3)
    monter(<HorairesPage />)
    const carte = within(carteMaladie())
    fireEvent.click(carte.getByRole('radio', { name: 'École' }))
    // L'école a sa propre règle d'heures : pas de case (audit RH du
    // 2026-11-01).
    expect(
      carte.queryByRole('switch', { name: 'Compté dans les heures' }),
    ).toBeNull()
    fireEvent.click(carte.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(service.enregistrerMotif).toHaveBeenCalledWith(
        {
          code: 'MA',
          nom: 'Maladie',
          couleur: '#000000',
          decompte: true,
          nature: 'ecole',
        },
        3,
      ),
    )
  })

  it('motif : usage compté sur la semaine type ET les jours posés, nombre de jours à la suppression', async () => {
    // Maladie (id 3) : absente des semaines types, posée 3 jours sur 2 personnes.
    absences.compterAbsencesParMotif.mockResolvedValue([
      { motif_id: 3, salarie_id: 1 },
      { motif_id: 3, salarie_id: 1 },
      { motif_id: 3, salarie_id: 2 },
      { motif_id: 1, salarie_id: 4 },
    ])
    service.supprimerMotif.mockResolvedValue(undefined)
    monter(<HorairesPage />)
    const carte = within(carteMaladie())
    expect(await carte.findByText('Utilisé par 2 personnes')).toBeTruthy()
    fireEvent.click(carte.getByRole('button', { name: 'Supprimer' }))
    expect(
      await screen.findByText(
        /3 jours d'absence posés avec ce motif seront effacés du planning/,
      ),
    ).toBeTruthy()
    // La confirmation s'ouvre par-dessus le volet : son bouton est le dernier.
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Supprimer' }).at(-1)!,
    )
    await waitFor(() => expect(service.supprimerMotif).toHaveBeenCalledWith(3))
  })
})

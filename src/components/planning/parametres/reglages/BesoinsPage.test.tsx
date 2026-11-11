// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'

import { codeTest } from '#/lib/planning/test/codesTest.ts'
import type { Besoin, Referentiel } from '#/lib/planning/types.ts'

/*
 * La page Besoins refaite le 2026-10-31, contre un service simulé. Oracle de
 * chaque test : la demande de l'utilisateur du même jour (« très compliquée
 * à comprendre… je ne sais pas comment revenir ») et ses décisions : un poste
 * à la fois en onglets, un chiffre par case (personnes nécessaires), les
 * apprentis et le « en plus » en options de la case avec un repère, la
 * copie sur d'autres jours explicite, Annuler et Rétablir, la présence
 * minimum sous la grille avec un repère vert ou orange.
 *
 * Révisé le 2026-11-01 (plan `planning-accueil-2026-11-01`) : la présence
 * minimum devient le TABLEAU DE L'ACCUEIL (un chiffre exact par case), et les
 * postes de l'accueil (case « présence », veille de nuit) n'ont plus
 * d'onglet. Le référentiel de démo n'a aucune case « présence » cochée : ses
 * Réception et Club servent ici de postes à grille ordinaires.
 */

const etat = vi.hoisted(() => ({
  droits: { pret: true, lire: true, ecrire: true, gerer: true },
  referentiel: null as Referentiel | null,
}))
const service = vi.hoisted(() => ({
  reglerBesoin: vi.fn(),
  reglerConsigne: vi.fn(),
  reglerHeuresPoste: vi.fn(),
  enregistrerReglages: vi.fn(),
  enregistrerMomentsHoraires: vi.fn(),
  enregistrerMoments: vi.fn(),
  supprimerMoment: vi.fn(),
}))

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
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

const { BesoinsPage } =
  await import('#/components/planning/parametres/BesoinsPage.tsx')
const { monter, referentielDemo } =
  await import('#/components/planning/parametres/reglages/test/monter.tsx')

/** La base simulée : une écriture modifie (ou crée) le besoin, que la
 * relecture suivante rend au référentiel. */
function baseSimulee() {
  let n = 10_000
  service.reglerBesoin.mockImplementation(
    async (v: Omit<Besoin, 'id'>, existant?: Besoin) => {
      if (existant) Object.assign(existant, v)
      else etat.referentiel?.besoins.push({ id: ++n, ...v })
    },
  )
}

beforeEach(() => {
  etat.referentiel = referentielDemo()
  etat.droits = { pret: true, lire: true, ecrire: true, gerer: true }
  service.reglerBesoin.mockReset()
  service.reglerConsigne.mockReset().mockResolvedValue(undefined)
  service.reglerHeuresPoste.mockReset().mockResolvedValue(undefined)
  service.enregistrerReglages.mockReset().mockResolvedValue(undefined)
  service.enregistrerMomentsHoraires.mockReset().mockResolvedValue(undefined)
  service.enregistrerMoments.mockReset().mockResolvedValue(undefined)
  service.supprimerMoment.mockReset().mockResolvedValue(undefined)
  baseSimulee()
})
afterEach(cleanup)

const onglet = (nom: string) => {
  const tab = screen.getByRole('tab', { name: new RegExp(`^${nom}`) })
  fireEvent.mouseDown(tab, { button: 0 })
  return tab
}
const grille = (nom: string) =>
  within(screen.getByRole('table', { name: `Besoins du poste ${nom}` }))
const caseDe = (poste: string, jour: string, horaire: string) =>
  grille(poste).getByRole('button', {
    name: new RegExp(`^${poste}, ${jour}, ${horaire} :`),
  })
const ouvrirCase = (poste: string, jour: string, horaire: string) => {
  fireEvent.click(caseDe(poste, jour, horaire))
  return within(screen.getByRole('dialog'))
}
const besoinDe = (
  ref: Referentiel,
  posteId: number,
  code: string,
  jour: number,
) =>
  ref.besoins.find(
    (b) =>
      b.poste_id === posteId &&
      b.jour === jour &&
      b.horaire_id === ref.horaires.find((h) => codeTest(h) === code)?.id,
  ) as Besoin

describe('Besoins', () => {
  it('un poste à la fois : les onglets changent la grille', () => {
    // Oracle : « les postes en onglets en haut ; une seule grille à l'écran ».
    // Aucun poste coché « présence » : pas de tableau de l'accueil, tous les
    // postes gardent leur grille (même règle que le moteur, 2026-11-01).
    monter(<BesoinsPage />)
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    expect(
      screen.getAllByRole('table', { name: /^Besoins du poste/ }),
    ).toHaveLength(1)
    expect(
      screen.getByRole('table', { name: 'Besoins du poste Direction' }),
    ).toBeTruthy()
    const tab = onglet('Réception')
    expect(tab.getAttribute('aria-selected')).toBe('true')
    expect(
      screen.getByRole('table', { name: 'Besoins du poste Réception' }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('table', { name: 'Besoins du poste Direction' }),
    ).toBeNull()
    // Heures de présence à côté du nom : M et AM à 1 chaque jour (8h45
    // chacun), MI à 0 : 7 × 17h30.
    expect(tab.textContent).toContain('122h30')
    // Plus de bouton qui recopie le lundi en silence, plus de choix « Vous réglez ».
    expect(screen.queryByRole('button', { name: /Recopier/ })).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('un lien vers un poste ouvre son onglet', () => {
    // Oracle : les points « À vérifier » mènent à `poste-<id>`.
    monter(<BesoinsPage ouvrir="poste-3" />)
    expect(
      screen.getByRole('tab', { name: /^Club/ }).getAttribute('aria-selected'),
    ).toBe('true')
  })

  it('la case montre les personnes nécessaires ; + dans le panneau écrit la bonne valeur', async () => {
    // Oracle : « UN chiffre par case = les personnes nécessaires » ; le
    // panneau écrit par la même fonction qu'avant, avec le besoin existant.
    monter(<BesoinsPage />)
    onglet('Réception')
    const existant = besoinDe(etat.referentiel as Referentiel, 2, 'M', 0)
    const c = caseDe('Réception', 'lundi', '07:00–15:45')
    expect(c.getAttribute('aria-label')).toBe(
      'Réception, lundi, 07:00–15:45 : 1 personne nécessaire, 1 place pour apprenti ou stagiaire',
    )
    const panneau = ouvrirCase('Réception', 'lundi', '07:00–15:45')
    expect(
      screen.getByRole('dialog', { name: 'Réception · Lundi · 07:00–15:45' }),
    ).toBeTruthy()
    fireEvent.click(
      panneau.getByRole('button', {
        name: 'Personnes nécessaires : un de plus',
      }),
    )
    await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(1))
    expect(service.reglerBesoin.mock.calls[0][0]).toEqual({
      poste_id: 2,
      jour: 0,
      horaire_id: 1,
      debut: '07:00',
      fin: '15:45',
      effectif: 2,
      soutien: 1,
      renfort: 0,
      obligatoire: true,
      niveau_min: null,
      niveaux: [],
    })
    // Le besoin existant, relu en base (même objet).
    expect(service.reglerBesoin.mock.calls[0][1]).toBe(existant)
    fireEvent.click(
      panneau.getByRole('button', {
        name: 'Personnes nécessaires : un de moins',
      }),
    )
    await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(2))
    expect(service.reglerBesoin.mock.calls[1][0].effectif).toBe(1)
  })

  it('Appliquer à Samedi et dimanche écrit les deux jours avec les trois valeurs', async () => {
    // Oracle : « copie EXPLICITE des trois valeurs de cette case vers les
    // jours choisis de la même ligne ».
    const ref = referentielDemo()
    Object.assign(besoinDe(ref, 2, 'M', 0), {
      effectif: 2,
      soutien: 1,
      renfort: 1,
    })
    etat.referentiel = ref
    monter(<BesoinsPage />)
    onglet('Réception')
    const panneau = ouvrirCase('Réception', 'lundi', '07:00–15:45')
    fireEvent.click(panneau.getByRole('button', { name: 'Samedi et dimanche' }))
    await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(2))
    expect(
      service.reglerBesoin.mock.calls.map(([v]) => [
        v.jour,
        v.effectif,
        v.soutien,
        v.renfort,
      ]),
    ).toEqual([
      [5, 2, 1, 1],
      [6, 2, 1, 1],
    ])
    expect(
      screen.getByText('Copié sur 2 jours. Ctrl + Z pour annuler.'),
    ).toBeTruthy()
  })

  it('Annuler remet les valeurs d’avant, Rétablir celles d’après', async () => {
    // Oracle : « Annuler / Rétablir (indispensable, c'est ce qui a manqué à
    // l'utilisateur) », par le bouton et par Ctrl + Z / Ctrl + Y.
    const ref = referentielDemo()
    Object.assign(besoinDe(ref, 2, 'M', 0), {
      effectif: 2,
      soutien: 1,
      renfort: 1,
    })
    etat.referentiel = ref
    monter(<BesoinsPage />)
    onglet('Réception')
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Annuler' })
        .disabled,
    ).toBe(true)
    const panneau = ouvrirCase('Réception', 'lundi', '07:00–15:45')
    fireEvent.click(panneau.getByRole('button', { name: 'Samedi et dimanche' }))
    await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(4))
    // Valeurs d'avant : 1 personne, 1 apprenti, 0 en plus (hôtel fictif).
    expect(
      service.reglerBesoin.mock.calls
        .slice(2)
        .map(([v]) => [v.jour, v.effectif, v.soutien, v.renfort]),
    ).toEqual([
      [5, 1, 1, 0],
      [6, 1, 1, 0],
    ])
    expect(caseDe('Réception', 'samedi', '07:00–15:45').textContent).toContain(
      '1',
    )

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(6))
    expect(
      service.reglerBesoin.mock.calls
        .slice(4)
        .map(([v]) => [v.jour, v.effectif, v.renfort]),
    ).toEqual([
      [5, 2, 1],
      [6, 2, 1],
    ])

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(8))
    expect(service.reglerBesoin.mock.calls[7][0]).toMatchObject({
      jour: 6,
      effectif: 1,
      renfort: 0,
    })
  })

  it('Vider cette ligne met la semaine à 0, et s’annule', async () => {
    // Oracle : « un menu ⋯ avec Vider cette ligne (toutes les valeurs à 0
    // sur la semaine) ».
    monter(<BesoinsPage />)
    onglet('Réception')
    fireEvent.pointerDown(
      grille('Réception').getByRole('button', {
        name: 'Actions de la ligne 07:00–15:45',
      }),
      { button: 0, pointerType: 'mouse' },
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Vider cette ligne' }))
    await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(7))
    for (const [v] of service.reglerBesoin.mock.calls) {
      expect(v).toMatchObject({ effectif: 0, soutien: 0, renfort: 0 })
    }
    // La ligne reste à l'écran, à 0.
    expect(caseDe('Réception', 'lundi', '07:00–15:45').textContent).toBe('–')
    expect(screen.getByText('Ligne vidée. Ctrl + Z pour annuler.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(14))
    expect(service.reglerBesoin.mock.calls[7][0]).toMatchObject({
      effectif: 1,
      soutien: 1,
    })
  })

  it('le repère +1 app. apparaît quand la case a une place d’apprenti', async () => {
    // Oracle : « une case qui a du soutien ou du en plus montre un petit
    // repère discret (+1 app., +1 si besoin) ».
    const ref = referentielDemo()
    besoinDe(ref, 2, 'M', 0).soutien = 0
    etat.referentiel = ref
    monter(<BesoinsPage />)
    onglet('Réception')
    const c = () => caseDe('Réception', 'lundi', '07:00–15:45')
    expect(c().querySelector('[data-repere]')).toBeNull()
    const panneau = ouvrirCase('Réception', 'lundi', '07:00–15:45')
    fireEvent.click(panneau.getByRole('button', { name: 'Options' }))
    fireEvent.click(
      panneau.getByRole('button', {
        name: 'Places pour apprentis ou stagiaires : un de plus',
      }),
    )
    expect(c().textContent).toContain('+1 app.')
    fireEvent.click(
      panneau.getByRole('button', { name: 'En plus si besoin : un de plus' }),
    )
    expect(c().textContent).toContain('+1 si besoin')
    await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(2))
    expect(service.reglerBesoin.mock.calls[1][0]).toMatchObject({
      jour: 0,
      effectif: 1,
      soutien: 1,
      renfort: 1,
    })
  })

  it('un nouvel horaire : la case crée le besoin, deux clics rapides n’en créent qu’un', async () => {
    // Oracle : règles d'écriture inchangées (besoin relu avant chaque écriture).
    monter(<BesoinsPage />)
    onglet('Club')
    expect(grille('Club').queryByText('09:00–17:45')).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Ajouter un horaire au poste Club' }),
    )
    fireEvent.click(
      within(
        screen.getByRole('list', { name: 'Horaires à ajouter' }),
      ).getByRole('button', {
        name: /09:00–17:45/,
      }),
    )
    const panneau = ouvrirCase('Club', 'jeudi', '09:00–17:45')
    const plus = panneau.getByRole('button', {
      name: 'Personnes nécessaires : un de plus',
    })
    fireEvent.click(plus)
    fireEvent.click(plus)
    await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(2))
    const [premier, second] = service.reglerBesoin.mock.calls
    expect(premier[1]).toBeUndefined()
    // Un nouveau besoin n’ouvre plus de place d’apprenti (2026-11-01).
    expect(premier[0]).toMatchObject({
      poste_id: 3,
      jour: 3,
      horaire_id: 2,
      effectif: 1,
      soutien: 0,
    })
    expect(second[0].effectif).toBe(2)
    expect(second[1]).toMatchObject({ poste_id: 3, jour: 3, horaire_id: 2 })
  })

  it('signale un horaire trop long et un horaire non permis sur la ligne', () => {
    // Oracle : « une icône d'alerte avec infobulle et texte accessible ».
    const ref = referentielDemo()
    const d = ref.horaires.find((h) => codeTest(h) === 'D')
    if (d) d.fin = '20:00'
    for (const b of ref.besoins) if (b.horaire_id === d?.id) b.fin = '20:00'
    const reception = ref.postes.find((p) => p.nom === 'Réception')
    if (reception) reception.horaires_autorises = [2, 3]
    etat.referentiel = ref
    monter(<BesoinsPage />)
    expect(
      grille('Direction').getByText(
        /dépasse la durée maximale d'un service sur ce poste \(11 h 30/,
      ),
    ).toBeTruthy()
    onglet('Réception')
    expect(
      grille('Réception').getByText(
        "Cet horaire n'est pas dans les horaires possibles du poste.",
      ),
    ).toBeTruthy()
  })

  it('apprentis sans personne à côté : signalés sur la ligne, retirés par le menu', async () => {
    // Oracle : `soutienSansBase` (jamais placés), alerte de ligne.
    const ref = referentielDemo()
    for (const b of ref.besoins) if (b.poste_id === 1) b.renfort = 0
    etat.referentiel = ref
    monter(<BesoinsPage />)
    expect(
      grille('Direction').getByText(/sans personne à côté, 5 jours/),
    ).toBeTruthy()
    fireEvent.pointerDown(
      grille('Direction').getByRole('button', {
        name: 'Actions de la ligne 08:00–18:00',
      }),
      { button: 0, pointerType: 'mouse' },
    )
    fireEvent.click(
      screen.getByRole('menuitem', {
        name: "Retirer les places d'apprentis sans personne à côté",
      }),
    )
    await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(5))
    expect(
      service.reglerBesoin.mock.calls.map(([v]) => [v.jour, v.soutien]),
    ).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ])
  })

  describe("tableau de l'accueil", () => {
    // Décisions du 2026-11-01 : Réception et Club (case « présence ») et la
    // veille de nuit forment l'accueil ; un chiffre exact par case.
    const avecAccueil = (): Referentiel => {
      const ref = referentielDemo()
      for (const p of ref.postes)
        p.zone_id = ['Réception', 'Club', 'Veille de nuit'].includes(p.nom)
          ? 1
          : null
      ref.consignes = [
        { id: 1, jour: 5, periode: 'matin', minimum: 3, maximum: 3 },
        { id: 2, jour: 0, periode: 'nuit', minimum: 1, maximum: 1 },
      ]
      return ref
    }
    const caseAccueil = (cle: string) =>
      document.querySelector<HTMLElement>(`[data-presence="${cle}"]`)

    it("les postes de l'accueil n'ont plus d'onglet, le tableau montre le chiffre", () => {
      // Oracle : « il faut 3 personnes, peu importe qu'il soit réception ou club ».
      etat.referentiel = avecAccueil()
      monter(<BesoinsPage />)
      const onglets = screen.getAllByRole('tab').map((t) => t.textContent)
      expect(onglets.some((t) => /Réception|Club|Veille/.test(t ?? ''))).toBe(
        false,
      )
      const region = screen.getByRole('region', { name: 'Accueil' })
      // Refonte du 2026-11-11 : le jour « au moins », la nuit « exactement ».
      expect(region.textContent).toContain(
        'Le jour, le nombre est un minimum ; la nuit, il est exact.',
      )
      // Aucun nom de poste dans le texte (demande du 2026-11-11).
      expect(region.textContent).not.toMatch(/Réception|Club|Veille/)
      // Un paragraphe, pas une liste (demande du 2026-11-11).
      expect(region.querySelector('ul')).toBeNull()
      expect(caseAccueil('5:matin')?.textContent).toBe('3')
      expect(caseAccueil('5:matin')?.getAttribute('aria-label')).toBe(
        'Matin, samedi : au moins 3 personnes.',
      )
      expect(caseAccueil('0:nuit')?.getAttribute('aria-label')).toBe(
        'Nuit, lundi : exactement 1 personne.',
      )
      expect(caseAccueil('1:matin')?.textContent).toBe('–')
      // Le tiret n'est expliqué que s'il y en a un.
      expect(region.textContent).toContain("personne n'est demandé")
      // Aucun mot de l'ancien réglage.
      expect(region.textContent).not.toMatch(/maximum|consigne/i)
    })

    it('un lien vers un poste de l’accueil mène au tableau, pas à un onglet', () => {
      etat.referentiel = avecAccueil()
      const club = etat.referentiel.postes.find((p) => p.nom === 'Club')
      monter(<BesoinsPage ouvrir={`poste-${club?.id}`} />)
      expect(screen.queryByRole('tab', { name: /^Club/ })).toBeNull()
      expect(screen.getByRole('region', { name: 'Accueil' })).toBeTruthy()
    })

    it('un compteur écrit un chiffre exact ; 0 retire la case ; Annuler la remet', async () => {
      // Oracle : contrainte `planning_consignes_exact` (minimum = maximum).
      etat.referentiel = avecAccueil()
      monter(<BesoinsPage />)
      fireEvent.click(caseAccueil('0:soir') as HTMLElement)
      const panneau = within(
        screen.getByRole('dialog', { name: 'Soir · Lundi' }),
      )
      fireEvent.click(
        panneau.getByRole('button', { name: 'Au moins : un de plus' }),
      )
      await waitFor(() =>
        expect(service.reglerConsigne).toHaveBeenCalledWith(
          { zone_id: 1, jour: 0, periode: 'soir', minimum: 1, maximum: 1 },
          undefined,
        ),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
      await waitFor(() =>
        expect(service.reglerConsigne).toHaveBeenLastCalledWith(
          { zone_id: 1, jour: 0, periode: 'soir', minimum: 0, maximum: null },
          undefined,
        ),
      )
      // Samedi matin 3 → 2 : toujours un seul chiffre.
      fireEvent.click(caseAccueil('5:matin') as HTMLElement)
      fireEvent.click(
        within(
          screen.getByRole('dialog', { name: 'Matin · Samedi' }),
        ).getByRole('button', { name: 'Au moins : un de moins' }),
      )
      await waitFor(() =>
        expect(service.reglerConsigne).toHaveBeenLastCalledWith(
          { zone_id: 1, jour: 5, periode: 'matin', minimum: 2, maximum: 2 },
          expect.objectContaining({ id: 1 }),
        ),
      )
    })
  })

  describe('obligatoire ou souhaité, niveau demandé, importance (étape 7, 2026-11-05)', () => {
    it('Souhaité écrit obligatoire = faux, montre le repère, et s’annule', async () => {
      // Oracle : D4, « obligatoire / souhaité » dans le panneau, un repère
      // discret dans la case, Annuler comme toute action de la page.
      monter(<BesoinsPage />)
      onglet('Réception')
      const panneau = ouvrirCase('Réception', 'lundi', '07:00–15:45')
      fireEvent.click(panneau.getByRole('radio', { name: 'Souhaité' }))
      await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(1))
      expect(service.reglerBesoin.mock.calls[0][0]).toMatchObject({
        effectif: 1,
        obligatoire: false,
        niveau_min: null,
      })
      await waitFor(() =>
        expect(
          caseDe('Réception', 'lundi', '07:00–15:45').querySelector(
            '[data-repere="souhaite"]',
          ),
        ).toBeTruthy(),
      )
      expect(
        caseDe('Réception', 'lundi', '07:00–15:45').getAttribute('aria-label'),
      ).toContain('souhaité')
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
      await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(2))
      expect(service.reglerBesoin.mock.calls[1][0]).toMatchObject({
        obligatoire: true,
      })
    })

    it('Titulaire seulement écrit le niveau demandé ; une case vide ne le règle pas', async () => {
      monter(<BesoinsPage />)
      onglet('Réception')
      const panneau = ouvrirCase('Réception', 'lundi', '07:00–15:45')
      fireEvent.click(
        panneau.getByRole('radio', { name: 'Titulaire seulement' }),
      )
      await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(1))
      expect(service.reglerBesoin.mock.calls[0][0]).toMatchObject({
        niveau_min: 'titulaire',
      })
      await waitFor(() =>
        expect(
          caseDe('Réception', 'lundi', '07:00–15:45').querySelector(
            '[data-repere="niveau"]',
          ),
        ).toBeTruthy(),
      )
      // Une case sans personne nécessaire (le middle, 1 en plus si besoin) :
      // rien à rendre souhaité (refusé), le niveau demandé reste réglable.
      cleanup()
      monter(<BesoinsPage />)
      onglet('Réception')
      const vide = ouvrirCase('Réception', 'lundi', '09:00–17:45')
      expect(
        (vide.getByRole('radio', { name: 'Souhaité' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true)
      expect(
        (
          vide.getByRole('radio', {
            name: 'Titulaire seulement',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false)
    })

    it('un nombre par niveau : 1 Titulaire et 1 Dépannage, le chiffre en est la somme (2026-11-06)', async () => {
      monter(<BesoinsPage />)
      onglet('Réception')
      const panneau = ouvrirCase('Réception', 'lundi', '07:00–15:45')
      fireEvent.click(
        panneau.getByRole('checkbox', { name: 'Un nombre par niveau' }),
      )
      await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(1))
      // La personne nécessaire passe au dernier niveau (tout niveau).
      expect(service.reglerBesoin.mock.calls[0][0]).toMatchObject({
        effectif: 1,
        niveau_min: null,
        niveaux: [{ niveau: 'occasionnel', nombre: 1 }],
      })
      fireEvent.click(
        panneau.getByRole('button', {
          name: 'Personnes au niveau Titulaire : un de plus',
        }),
      )
      await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(2))
      expect(service.reglerBesoin.mock.calls[1][0]).toMatchObject({
        effectif: 2,
        niveaux: [
          { niveau: 'titulaire', nombre: 1 },
          { niveau: 'occasionnel', nombre: 1 },
        ],
      })
      await waitFor(() =>
        expect(
          caseDe('Réception', 'lundi', '07:00–15:45').getAttribute(
            'aria-label',
          ),
        ).toContain('1 Titulaire et 1 Dépannage'),
      )
    })

    it('l’ordre de décision est écrit d’après le réglage indispensable', () => {
      // Oracle : décision utilisateur du 2026-11-05, « soit un poste est
      // important, soit il ne l'est pas » ; le texte n'est plus figé.
      const ref = etat.referentiel as Referentiel
      const texte = () =>
        document.querySelector('[data-ordre-decision]')?.textContent ?? ''
      monter(<BesoinsPage />)
      expect(texte()).toContain("Aucun poste n'est plus indispensable")
      cleanup()
      for (const p of ref.postes) p.indispensable = p.nom === 'Réception'
      monter(<BesoinsPage />)
      expect(texte()).toMatch(
        /d'abord les besoins souhaités, puis les autres postes \([^)]*Direction[^)]*\), et les postes indispensables \(Réception\) en dernier\./,
      )
      expect(texte()).not.toMatch(/[«»—]/)
      // Plus aucun rappel de trois niveaux.
      expect(document.body.textContent).not.toMatch(/Si possible|Important\b/)
    })

    it('chaque poste dans la section de son réglage ; un poste neuf aussi', () => {
      // Oracle : « imaginons demain je crée des nouveaux postes, je n'ai pas
      // envie de devoir refabriquer un moteur ».
      const ref = etat.referentiel as Referentiel
      for (const p of ref.postes) p.indispensable = p.nom === 'Réception'
      ref.postes.push({
        ...ref.postes[0],
        id: 9999,
        nom: 'Zéphyr',
        indispensable: true,
      })
      monter(<BesoinsPage />)
      const indispensables = within(
        screen.getByRole('region', { name: 'Postes indispensables' }),
      )
      const autres = within(
        screen.getByRole('region', { name: 'Autres postes, tenus au mieux' }),
      )
      const noms = (r: typeof autres) =>
        r.getAllByRole('tab').map((t) => t.textContent?.replace(/\d.*$/, ''))
      expect(noms(indispensables)).toEqual(['Réception', 'Zéphyr'])
      expect(noms(autres)).not.toContain('Réception')
      expect(noms(autres)).toContain('Direction')
      // Deux grilles : une par section.
      expect(
        screen.getAllByRole('table', { name: /^Besoins du poste/ }),
      ).toHaveLength(2)
    })

    it('moments : réglés depuis Besoins, aperçu puis Enregistrer', async () => {
      // Oracle : « migrer la partie Moments dans Besoins ».
      monter(<BesoinsPage />)
      const region = within(screen.getByRole('region', { name: 'Moments' }))
      // Rien à enregistrer tant qu'aucune limite ne change.
      expect(region.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
      const champ = region.getByRole('textbox', { name: 'Nuit commence de' })
      fireEvent.change(champ, { target: { value: '23:30' } })
      fireEvent.blur(champ)
      expect(
        await region.findByRole('list', {
          name: 'Horaires qui changeraient de moment',
        }),
      ).toBeTruthy()
      expect(service.enregistrerMoments).not.toHaveBeenCalled()
      fireEvent.click(region.getByRole('button', { name: 'Enregistrer' }))
      await waitFor(() =>
        expect(service.enregistrerMoments).toHaveBeenCalledWith([
          expect.objectContaining({ id: 'nuit', debut_de: 23 * 60 + 30 }),
        ]),
      )
    })

    it('accueil tenu en continu : ni ouverture ni fermeture à régler (2026-11-11)', () => {
      const ref = etat.referentiel as Referentiel
      for (const p of ref.postes)
        p.zone_id = ['Réception', 'Club', 'Veille de nuit'].includes(p.nom)
          ? 1
          : null
      ref.zones = [{ id: 1, nom: 'Accueil', ordre: 0, continue: true }]
      monter(<BesoinsPage />)
      // Oracle : « tu peux les retirer… le bloc disparaît ».
      expect(
        screen.queryByRole('region', { name: 'Ouverture et fermeture' }),
      ).toBeNull()
      expect(screen.queryByLabelText('Fermeture du poste Club')).toBeNull()
    })

    it('ouverture et fermeture d’une zone non continue : réglées ici, par Enregistrer', async () => {
      const ref = etat.referentiel as Referentiel
      for (const p of ref.postes)
        p.zone_id = ['Réception', 'Club', 'Veille de nuit'].includes(p.nom)
          ? 1
          : null
      ref.zones = [{ id: 1, nom: 'Accueil', ordre: 0, continue: false }]
      monter(<BesoinsPage />)
      const region = within(
        screen.getByRole('region', { name: 'Ouverture et fermeture' }),
      )
      const champ = region.getByLabelText('Fermeture du poste Club')
      fireEvent.change(champ, { target: { value: '23:00' } })
      expect(service.reglerHeuresPoste).not.toHaveBeenCalled()
      fireEvent.click(region.getByRole('button', { name: 'Enregistrer' }))
      const club = ref.postes.find((p) => p.nom === 'Club')
      await waitFor(() =>
        expect(service.reglerHeuresPoste).toHaveBeenCalledWith(club?.id, {
          ouverture: club?.ouverture ?? null,
          fermeture: '23:00',
        }),
      )
    })

    it('passation entre les équipes : fixe, une phrase, aucun réglage (2026-11-06)', () => {
      const ref = etat.referentiel as Referentiel
      for (const p of ref.postes)
        p.zone_id = ['Réception', 'Club', 'Veille de nuit'].includes(p.nom)
          ? 1
          : null
      monter(<BesoinsPage />)
      // Oracle : « retire le paramétrage de cela ».
      expect(screen.queryByText('Passation entre les équipes')).toBeNull()
      for (const nom of [
        'Aucun trou entre deux équipes',
        'Passation avec la nuit',
      ])
        expect(screen.queryByRole('switch', { name: nom })).toBeNull()
      expect(
        screen.queryByRole('radiogroup', { name: 'Durée de la relève' }),
      ).toBeNull()
      expect(
        screen.queryByRole('radiogroup', {
          name: 'Équipe du soir ensemble, à combien de minutes près',
        }),
      ).toBeNull()
      expect(
        screen.getByText(
          "Entre deux équipes, la suivante arrive au plus tard quand la précédente part, nuit comprise. Le planning préfère qu'elles se croisent un moment.",
        ),
      ).toBeTruthy()
      expect(service.enregistrerReglages).not.toHaveBeenCalled()
    })

    it('lecture seule : obligatoire et niveau ne se règlent pas', () => {
      etat.droits = { pret: true, lire: true, ecrire: true, gerer: false }
      monter(<BesoinsPage />)
      onglet('Réception')
      const panneau = ouvrirCase('Réception', 'lundi', '07:00–15:45')
      for (const r of panneau.getAllByRole('radio'))
        expect((r as HTMLButtonElement).disabled).toBe(true)
    })
  })

  it('lecture seule : la case s’ouvre en lecture, rien ne s’écrit, pas d’Annuler', () => {
    // Oracle : « en lecture seule, les cases s'affichent mais ne s'ouvrent
    // pas en édition (ou le panneau est en lecture), pas d'Annuler ».
    etat.droits = { pret: true, lire: true, ecrire: true, gerer: false }
    monter(<BesoinsPage />)
    expect(screen.getByText(/Lecture seule/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /^Actions de la ligne/ }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: /^Ajouter un horaire/ }),
    ).toBeNull()
    onglet('Réception')
    const panneau = ouvrirCase('Réception', 'lundi', '07:00–15:45')
    for (const b of panneau.getAllByRole('button', {
      name: /un de (plus|moins)$/,
    })) {
      expect((b as HTMLButtonElement).disabled).toBe(true)
    }
    expect(
      panneau.queryByRole('button', { name: 'Samedi et dimanche' }),
    ).toBeNull()
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(service.reglerBesoin).not.toHaveBeenCalled()
  })
})

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
 */

const etat = vi.hoisted(() => ({
  droits: { pret: true, lire: true, ecrire: true, gerer: true },
  referentiel: null as Referentiel | null,
}))
const service = vi.hoisted(() => ({
  reglerBesoin: vi.fn(),
  reglerConsigne: vi.fn(),
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
    // Un nouveau besoin ouvre une place pour un apprenti (règle gardée).
    expect(premier[0]).toMatchObject({
      poste_id: 3,
      jour: 3,
      horaire_id: 2,
      effectif: 1,
      soutien: 1,
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
        /dépasse la durée maximale d'un service pour cette catégorie \(11 h 30/,
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

  describe('présence minimum', () => {
    // Réception et Club comptent ; M du matin, AM du soir, MI middle.
    const avecConsignes = (): Referentiel => {
      const ref = referentielDemo()
      for (const p of ref.postes)
        p.presence = p.nom === 'Réception' || p.nom === 'Club'
      const periodes: Partial<Record<string, 'matin' | 'middle' | 'soir'>> = {
        M: 'matin',
        MI: 'middle',
        AM: 'soir',
      }
      for (const h of ref.horaires)
        h.periode = periodes[codeTest(h) ?? ''] ?? null
      ref.consignes = [
        { id: 1, jour: 5, periode: 'matin', minimum: 3, maximum: null },
        { id: 2, jour: 0, periode: 'matin', minimum: 2, maximum: 2 },
      ]
      return ref
    }
    const casePresence = (cle: string) =>
      document.querySelector<HTMLElement>(`[data-presence="${cle}"]`)

    it('orange quand la grille n’atteint pas le minimum, vert sinon', () => {
      // Oracle indépendant : samedi matin, un M en Réception et un en Club
      // (effectif 1 chacun) = 2, moins que 3 ; lundi matin 2 = 2.
      etat.referentiel = avecConsignes()
      monter(<BesoinsPage />)
      const region = screen.getByRole('region', { name: 'Présence minimum' })
      expect(region.textContent).toContain(
        'tous postes de présence confondus (Réception et Club)',
      )
      expect(region.textContent).toContain(
        "La nuit ne compte pas : aucun poste n'a d'horaire de nuit.",
      )
      expect(casePresence('5:matin')?.dataset.etat).toBe('ecart')
      expect(casePresence('5:matin')?.getAttribute('aria-label')).toBe(
        'Matin, samedi : au moins 3. Les besoins donnent 2, le minimum est 3.',
      )
      expect(casePresence('0:matin')?.dataset.etat).toBe('ok')
      expect(casePresence('1:matin')?.dataset.etat).toBe('neutre')
    })

    it('le panneau règle le minimum, et Annuler le remet', async () => {
      // Oracle : « un clic ouvre un panneau avec deux compteurs » ; même
      // écriture qu'avant (le plafond suit le minimum).
      etat.referentiel = avecConsignes()
      monter(<BesoinsPage />)
      fireEvent.click(casePresence('0:soir') as HTMLElement)
      const panneau = within(
        screen.getByRole('dialog', { name: 'Soir · Lundi' }),
      )
      fireEvent.click(
        panneau.getByRole('button', { name: 'Au moins : un de plus' }),
      )
      await waitFor(() =>
        expect(service.reglerConsigne).toHaveBeenCalledWith(
          { jour: 0, periode: 'soir', minimum: 1, maximum: 1 },
          undefined,
        ),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
      await waitFor(() =>
        expect(service.reglerConsigne).toHaveBeenLastCalledWith(
          { jour: 0, periode: 'soir', minimum: 0, maximum: null },
          undefined,
        ),
      )
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

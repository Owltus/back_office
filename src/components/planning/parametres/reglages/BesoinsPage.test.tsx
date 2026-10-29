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
 * Besoins contre un service simulé. Vérifié : en lecture, aucun compteur
 * actif ; un compteur appelle `reglerBesoin` avec le besoin EXISTANT ; un
 * nouveau besoin ouvre une place de soutien ; « Toute la semaine » recopie
 * le lundi ; les deux points d'attention (trop long pour la catégorie, code
 * non permis pour le poste) ; les totaux du jour.
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

beforeEach(() => {
  etat.referentiel = referentielDemo()
  etat.droits = { pret: true, lire: true, ecrire: true, gerer: true }
  service.reglerBesoin.mockReset().mockResolvedValue(undefined)
  service.reglerConsigne.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

const poste = (nom: string) => within(screen.getByRole('region', { name: nom }))

describe('Besoins', () => {
  it('en écriture (sans gestion) : aucun compteur actif', () => {
    etat.droits = { pret: true, lire: true, ecrire: true, gerer: false }
    monter(<BesoinsPage />)
    expect(screen.getByText(/Lecture seule/)).toBeTruthy()
    for (const b of screen.getAllByRole('button', {
      name: /un de (plus|moins)$/,
    })) {
      expect((b as HTMLButtonElement).disabled).toBe(true)
    }
    expect(screen.queryByRole('button', { name: /Recopier/ })).toBeNull()
  })

  it('un compteur appelle reglerBesoin avec le besoin existant', async () => {
    monter(<BesoinsPage />)
    const existant = etat.referentiel?.besoins.find(
      (b) => b.poste_id === 2 && b.horaire_id === 1 && b.jour === 0,
    )
    expect(existant).toBeTruthy()
    fireEvent.click(
      poste('Réception').getByRole('button', {
        name: 'Personnes nécessaires Lundi, Matin : un de plus',
      }),
    )
    await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(1))
    expect(service.reglerBesoin).toHaveBeenCalledWith(
      {
        poste_id: 2,
        jour: 0,
        horaire_id: 1,
        debut: '07:00',
        fin: '15:45',
        effectif: 2,
        soutien: 1,
        renfort: 0,
      },
      existant,
    )
  })

  it('un nouveau besoin ouvre une place de soutien, sans besoin existant', async () => {
    monter(<BesoinsPage />)
    const club = poste('Club')
    expect(club.queryByText('Middle')).toBeNull()
    fireEvent.click(
      club.getByRole('button', { name: 'Ajouter un horaire au poste Club' }),
    )
    fireEvent.click(
      within(
        screen.getByRole('list', { name: 'Horaires à ajouter' }),
      ).getByRole('button', { name: /Middle/ }),
    )
    fireEvent.click(
      club.getByRole('button', {
        name: 'Personnes nécessaires Mardi, Middle : un de plus',
      }),
    )
    await waitFor(() =>
      expect(service.reglerBesoin).toHaveBeenCalledWith(
        {
          poste_id: 3,
          jour: 1,
          horaire_id: 2,
          debut: '09:00',
          fin: '17:45',
          effectif: 1,
          soutien: 1,
          renfort: 0,
        },
        undefined,
      ),
    )
  })

  it('deux clics rapides : le second part avec le besoin créé par le premier', async () => {
    let cree: unknown
    service.reglerBesoin.mockImplementation(async (v) => {
      // La base crée le besoin ; la relecture le rend au référentiel.
      if (!cree) {
        cree = { id: 999, ...v }
        etat.referentiel?.besoins.push(cree as never)
      }
    })
    monter(<BesoinsPage />)
    const club = poste('Club')
    fireEvent.click(
      club.getByRole('button', { name: 'Ajouter un horaire au poste Club' }),
    )
    fireEvent.click(
      within(
        screen.getByRole('list', { name: 'Horaires à ajouter' }),
      ).getByRole('button', { name: /Middle/ }),
    )
    const plus = club.getByRole('button', {
      name: 'Personnes nécessaires Jeudi, Middle : un de plus',
    })
    fireEvent.click(plus)
    fireEvent.click(plus)
    await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(2))
    const [premier, second] = service.reglerBesoin.mock.calls
    expect(premier[1]).toBeUndefined()
    expect(premier[0].effectif).toBe(1)
    expect(second[0].effectif).toBe(2)
    expect(second[1]).toBe(cree)
  })

  it('Recopier recopie le lundi sur les six autres jours', async () => {
    monter(<BesoinsPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'En plus si besoin' }))
    const r = poste('Réception')
    fireEvent.click(
      r.getByRole('button', {
        name: 'En plus si besoin Lundi, Matin : un de plus',
      }),
    )
    fireEvent.click(
      r.getByRole('button', {
        name: 'Recopier le lundi sur toute la semaine, Matin',
      }),
    )
    await waitFor(() => expect(service.reglerBesoin).toHaveBeenCalledTimes(7))
    const jours = service.reglerBesoin.mock.calls
      .slice(1)
      .map(([v]) => [v.jour, v.renfort])
    expect(jours).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [5, 1],
      [6, 1],
    ])
  })

  it('signale un besoin trop long pour la catégorie et un code non permis', () => {
    const ref = referentielDemo()
    const d = ref.horaires.find((h) => h.code === 'D')
    if (d) d.fin = '20:00'
    for (const b of ref.besoins) if (b.horaire_id === d?.id) b.fin = '20:00'
    const reception = ref.postes.find((p) => p.nom === 'Réception')
    if (reception) reception.horaires_autorises = [2, 3]
    etat.referentiel = ref
    monter(<BesoinsPage />)
    expect(
      poste('Direction').getByText(
        /dépasse la durée maximale d'un service pour cette catégorie \(11 h 30/,
      ),
    ).toBeTruthy()
    expect(
      poste('Réception').getByText(
        "Ce code n'est pas dans les horaires possibles du poste.",
      ),
    ).toBeTruthy()
  })

  it('totaux : présence de la semaine et personnes par jour', () => {
    monter(<BesoinsPage />)
    // Réception : M et AM à 1 chaque jour (8h45 chacun), MI à 0 : 7 × 17h30.
    expect(
      poste('Réception').getByText('122h30 de présence / semaine'),
    ).toBeTruthy()
  })

  it('consignes de présence : au moins et au plus, le plafond suit', async () => {
    const lundiSoir = {
      id: 7,
      jour: 0,
      periode: 'soir' as const,
      minimum: 2,
      maximum: 2,
    }
    etat.referentiel = { ...referentielDemo(), consignes: [lundiSoir] }
    monter(<BesoinsPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'Matin et soir' }))
    const carte = within(
      screen.getByRole('region', { name: 'Présence du matin et du soir' }),
    )
    fireEvent.click(
      carte.getByRole('button', {
        name: 'Matin du samedi : au moins : un de plus',
      }),
    )
    await waitFor(() =>
      expect(service.reglerConsigne).toHaveBeenCalledWith(
        { jour: 5, periode: 'matin', minimum: 1, maximum: 1 },
        undefined,
      ),
    )
    fireEvent.click(carte.getByRole('radio', { name: 'Au plus' }))
    fireEvent.click(
      carte.getByRole('button', {
        name: 'Soir du lundi : au plus : un de plus',
      }),
    )
    // Affiché tout de suite, avant la réponse.
    expect(carte.getByText('2 ou 3')).toBeTruthy()
    await waitFor(() =>
      expect(service.reglerConsigne).toHaveBeenLastCalledWith(
        { jour: 0, periode: 'soir', minimum: 2, maximum: 3 },
        lundiSoir,
      ),
    )
    // Réponse reçue : la base (simulée, inchangée) fait foi. Le plafond
    // descend sous le minimum : le minimum suit.
    await waitFor(() =>
      expect(carte.getAllByText('2').length).toBeGreaterThan(0),
    )
    fireEvent.click(
      carte.getByRole('button', {
        name: 'Soir du lundi : au plus : un de moins',
      }),
    )
    await waitFor(() =>
      expect(service.reglerConsigne).toHaveBeenLastCalledWith(
        { jour: 0, periode: 'soir', minimum: 1, maximum: 1 },
        lundiSoir,
      ),
    )
  })

  it('en écriture (sans gestion) : consignes en lecture seule', () => {
    etat.droits = { pret: true, lire: true, ecrire: true, gerer: false }
    monter(<BesoinsPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'Matin et soir' }))
    const carte = within(
      screen.getByRole('region', { name: 'Présence du matin et du soir' }),
    )
    for (const b of carte.getAllByRole('button', {
      name: /un de (plus|moins)$/,
    })) {
      expect((b as HTMLButtonElement).disabled).toBe(true)
    }
  })

  describe('matin et soir face aux besoins', () => {
    // Réception et Club comptent ; samedi matin, au moins 3.
    const avecConsigne = (): Referentiel => {
      const ref = referentielDemo()
      for (const p of ref.postes) {
        p.presence = p.nom === 'Réception' || p.nom === 'Club'
      }
      // M du matin, AM du soir, MI « middle » (moment lu sur l'heure).
      const periodes = { M: 'matin', MI: 'middle', AM: 'soir' } as const
      for (const h of ref.horaires) {
        h.periode = periodes[h.code as keyof typeof periodes] ?? null
      }
      ref.consignes = [
        { id: 1, jour: 5, periode: 'matin', minimum: 3, maximum: null },
      ]
      return ref
    }
    // Oracle indépendant : un code du matin compte le matin ; un middle,
    // le matin s'il commence de 5 h à 12 h 30 ; un code sans période jamais.
    const sommeAttendue = (ref: Referentiel, jour: number) => {
      const comptent = new Set(
        ref.postes.filter((p) => p.presence).map((p) => p.id),
      )
      let n = 0
      for (const b of ref.besoins) {
        if (b.jour !== jour || !comptent.has(b.poste_id)) continue
        const h = ref.horaires.find((x) => x.id === b.horaire_id)
        const matin =
          h?.periode === 'matin' ||
          (h?.periode === 'middle' && b.debut >= '05:00' && b.debut < '12:30')
        if (matin) n += b.effectif
      }
      return n
    }
    const caseBesoins = (cle: string) =>
      document.querySelector<HTMLElement>(`[data-besoins="${cle}"]`)
    const momentAjuste = () =>
      screen.getByRole('status', { name: 'Moment à ajuster' }).textContent

    it('affiche la somme des besoins et signale le samedi matin', () => {
      const ref = avecConsigne()
      etat.referentiel = ref
      monter(<BesoinsPage />)
      fireEvent.click(screen.getByRole('radio', { name: 'Matin et soir' }))
      expect(
        screen.getByText(/Les besoins par poste font le planning/),
      ).toBeTruthy()
      const attendu = sommeAttendue(ref, 5)
      expect(attendu).toBe(2)
      expect(caseBesoins('5:matin')?.textContent).toBe(`Besoins : ${attendu}`)
      expect(caseBesoins('5:matin')?.dataset.ecart).toBe('true')
      // Les autres jours n'ont pas de consigne : neutres.
      for (let j = 0; j < 7; j++) {
        for (const periode of ['matin', 'soir']) {
          if (j === 5 && periode === 'matin') continue
          expect(caseBesoins(`${j}:${periode}`)?.dataset.ecart).toBeUndefined()
        }
      }
      expect(caseBesoins('0:matin')?.textContent).toBe(
        `Besoins : ${sommeAttendue(ref, 0)}`,
      )
      expect(
        screen.getAllByRole('button', { name: /^Ajuster les besoins/ }),
      ).toHaveLength(1)
    })

    it('Ajuster ouvre la vue par poste sur le moment ; un besoin de plus efface l écart', async () => {
      etat.referentiel = avecConsigne()
      service.reglerBesoin.mockImplementation(async (v) => {
        // La base crée le besoin ; la relecture rend un nouveau référentiel.
        const r = etat.referentiel as Referentiel
        etat.referentiel = { ...r, besoins: [...r.besoins, { id: 999, ...v }] }
      })
      monter(<BesoinsPage />)
      fireEvent.click(screen.getByRole('radio', { name: 'Matin et soir' }))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Ajuster les besoins du samedi matin',
        }),
      )
      expect(
        screen
          .getByRole('radio', { name: 'Par poste' })
          .getAttribute('aria-checked'),
      ).toBe('true')
      expect(
        screen
          .getByRole('radio', { name: 'Personnes nécessaires' })
          .getAttribute('aria-checked'),
      ).toBe('true')
      expect(momentAjuste()).toContain(
        'Samedi matin : les besoins donnent 2, la consigne en veut au moins 3.',
      )
      // Les lignes du matin des postes qui comptent, rien d'autre.
      const lignes = [
        ...document.querySelectorAll<HTMLElement>('tr[data-evidence]'),
      ].map((tr) => [
        tr.closest('section')?.querySelector('h2')?.textContent,
        tr.querySelector('td div.truncate')?.textContent,
      ])
      expect(lignes).toEqual([
        ['Réception', 'Matin'],
        ['Réception', 'Middle'],
        ['Club', 'Matin'],
      ])
      expect(document.querySelectorAll('[data-jour-ajuste]')).toHaveLength(3)
      expect(service.reglerBesoin).not.toHaveBeenCalled()

      fireEvent.click(
        poste('Réception').getByRole('button', {
          name: 'Personnes nécessaires Samedi, Middle : un de plus',
        }),
      )
      await waitFor(() =>
        expect(momentAjuste()).toContain('les besoins donnent 3'),
      )
      fireEvent.click(screen.getByRole('radio', { name: 'Matin et soir' }))
      expect(sommeAttendue(etat.referentiel as Referentiel, 5)).toBe(3)
      expect(caseBesoins('5:matin')?.textContent).toBe('Besoins : 3')
      expect(caseBesoins('5:matin')?.dataset.ecart).toBeUndefined()
      expect(
        screen.queryByRole('button', { name: /^Ajuster les besoins/ }),
      ).toBeNull()
    })

    it('au plus : un dépassement se signale quand on règle le plafond', () => {
      const ref = avecConsigne()
      ref.consignes = [
        { id: 1, jour: 0, periode: 'matin', minimum: 1, maximum: 2 },
      ]
      // Deux personnes nécessaires le lundi matin en Réception : la somme
      // compte les personnes, pas les lignes.
      const m = ref.horaires.find((h) => h.code === 'M')
      for (const b of ref.besoins) {
        if (b.poste_id === 2 && b.jour === 0 && b.horaire_id === m?.id) {
          b.effectif = 2
        }
      }
      etat.referentiel = ref
      monter(<BesoinsPage />)
      fireEvent.click(screen.getByRole('radio', { name: 'Matin et soir' }))
      expect(sommeAttendue(ref, 0)).toBe(3)
      expect(caseBesoins('0:matin')?.textContent).toBe('Besoins : 3')
      expect(caseBesoins('0:matin')?.dataset.ecart).toBeUndefined()
      fireEvent.click(screen.getByRole('radio', { name: 'Au plus' }))
      expect(caseBesoins('0:matin')?.dataset.ecart).toBe('true')
    })
  })
})

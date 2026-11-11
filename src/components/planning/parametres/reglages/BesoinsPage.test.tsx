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

beforeEach(() => {
  etat.referentiel = referentielDemo()
  etat.droits = { pret: true, lire: true, ecrire: true, gerer: true }
  service.reglerConsigne.mockReset().mockResolvedValue(undefined)
  service.reglerHeuresPoste.mockReset().mockResolvedValue(undefined)
  service.enregistrerReglages.mockReset().mockResolvedValue(undefined)
  service.enregistrerMomentsHoraires.mockReset().mockResolvedValue(undefined)
  service.enregistrerMoments.mockReset().mockResolvedValue(undefined)
  service.supprimerMoment.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('Besoins', () => {
  // Plus de grille par poste (2026-11-11) : les postes non
  // indispensables sont remplis d'après les fiches (`besoinsLus`).
  it('aucune grille ni onglet de poste, plus de section Autres postes', () => {
    monter(<BesoinsPage />)
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.queryByText('Autres postes, tenus au mieux')).toBeNull()
    expect(
      screen.queryByRole('table', { name: /^Besoins du poste/ }),
    ).toBeNull()
  })

  describe("tableau de l'accueil", () => {
    // Décisions du 2026-11-01 : Réception et Club (case « présence ») et la
    // veille de nuit forment l'accueil ; un chiffre exact par case.
    // Un chiffre PAR POSTE depuis le 2026-11-11 (« combien en réception,
    // combien au club ; la nuit, les postes de nuit »).
    const idDe = (ref: Referentiel, nom: string) =>
      ref.postes.find((p) => p.nom === nom)?.id as number
    const avecAccueil = (): Referentiel => {
      const ref = referentielDemo()
      for (const p of ref.postes)
        p.zone_id = ['Réception', 'Club', 'Veille de nuit'].includes(p.nom)
          ? 1
          : null
      ref.consignes = [
        {
          id: 1,
          zone_id: 1,
          poste_id: idDe(ref, 'Réception'),
          jour: 5,
          periode: 'matin',
          minimum: 3,
          maximum: 3,
        },
        {
          id: 2,
          zone_id: 1,
          poste_id: idDe(ref, 'Veille de nuit'),
          jour: 0,
          periode: 'nuit',
          minimum: 1,
          maximum: 1,
        },
      ]
      return ref
    }
    const caseAccueil = (cle: string, poste: number) =>
      document.querySelector<HTMLElement>(
        `[data-presence="${cle}"][data-poste="${poste}"]`,
      )

    it('une ligne par moment et par poste ; le texte ne nomme aucun poste', () => {
      const ref = avecAccueil()
      etat.referentiel = ref
      const rec = idDe(ref, 'Réception')
      const club = idDe(ref, 'Club')
      const veille = idDe(ref, 'Veille de nuit')
      monter(<BesoinsPage />)
      expect(screen.queryAllByRole('tab')).toHaveLength(0)
      // Une seule zone : titrée « Personnel », jamais « Accueil » (2026-11-11).
      const region = screen.getByRole('region', { name: 'Personnel' })
      const texte = region.querySelector('p')?.textContent ?? ''
      expect(texte).toContain(
        'Le nombre minimum de personnes qui doivent être présentes, jour par jour.',
      )
      expect(texte).not.toMatch(/accueil|;|Réception|Club|Veille/i)
      expect(screen.queryByText('Postes indispensables')).toBeNull()
      expect(region.querySelector('ul')).toBeNull()
      // Le jour : Réception et Club ; la nuit : la veille seule.
      expect(caseAccueil('5:matin', rec)?.textContent).toBe('3')
      expect(caseAccueil('5:matin', rec)?.getAttribute('aria-label')).toBe(
        'Matin · Réception, samedi : au moins 3 personnes.',
      )
      expect(caseAccueil('5:matin', club)?.textContent).toBe('–')
      expect(caseAccueil('0:soir', club)).toBeTruthy()
      expect(caseAccueil('0:nuit', veille)?.getAttribute('aria-label')).toBe(
        'Nuit · Veille de nuit, lundi : exactement 1 personne.',
      )
      expect(caseAccueil('0:nuit', rec)).toBeNull()
      expect(caseAccueil('0:matin', veille)).toBeNull()
      // Aucune ligne de toute la zone quand chaque chiffre a son poste.
      expect(
        document.querySelector('[data-presence="0:matin"]:not([data-poste])'),
      ).toBeNull()
      expect(region.textContent).toContain("personne n'est demandé")
      expect(region.textContent).not.toMatch(/maximum|consigne/i)
    })

    it('un lien vers un poste de l’accueil mène au tableau, pas à un onglet', () => {
      etat.referentiel = avecAccueil()
      const club = etat.referentiel.postes.find((p) => p.nom === 'Club')
      monter(<BesoinsPage ouvrir={`poste-${club?.id}`} />)
      expect(screen.queryByRole('tab', { name: /^Club/ })).toBeNull()
      expect(screen.getByRole('region', { name: 'Personnel' })).toBeTruthy()
    })

    it('un compteur écrit le chiffre DU POSTE ; 0 retire la case ; Annuler la remet', async () => {
      const ref = avecAccueil()
      etat.referentiel = ref
      const rec = idDe(ref, 'Réception')
      const club = idDe(ref, 'Club')
      monter(<BesoinsPage />)
      fireEvent.click(caseAccueil('0:soir', club) as HTMLElement)
      const panneau = within(
        screen.getByRole('dialog', { name: 'Soir · Club · Lundi' }),
      )
      fireEvent.click(
        panneau.getByRole('button', { name: 'Au moins : un de plus' }),
      )
      await waitFor(() =>
        expect(service.reglerConsigne).toHaveBeenCalledWith(
          {
            zone_id: 1,
            poste_id: club,
            jour: 0,
            periode: 'soir',
            minimum: 1,
            maximum: 1,
          },
          undefined,
        ),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
      await waitFor(() =>
        expect(service.reglerConsigne).toHaveBeenLastCalledWith(
          {
            zone_id: 1,
            poste_id: club,
            jour: 0,
            periode: 'soir',
            minimum: 0,
            maximum: null,
          },
          undefined,
        ),
      )
      // Samedi matin Réception 3 → 2 : la ligne existante, celle du poste.
      fireEvent.click(caseAccueil('5:matin', rec) as HTMLElement)
      fireEvent.click(
        within(
          screen.getByRole('dialog', { name: 'Matin · Réception · Samedi' }),
        ).getByRole('button', { name: 'Au moins : un de moins' }),
      )
      await waitFor(() =>
        expect(service.reglerConsigne).toHaveBeenLastCalledWith(
          {
            zone_id: 1,
            poste_id: rec,
            jour: 5,
            periode: 'matin',
            minimum: 2,
            maximum: 2,
          },
          expect.objectContaining({ id: 1 }),
        ),
      )
    })

    it('un ancien chiffre de toute la zone garde sa ligne', () => {
      const ref = avecAccueil()
      ref.consignes = [
        {
          id: 9,
          zone_id: 1,
          jour: 2,
          periode: 'matin',
          minimum: 2,
          maximum: 2,
        },
      ]
      etat.referentiel = ref
      monter(<BesoinsPage />)
      expect(
        document.querySelector('[data-presence="2:matin"]:not([data-poste])')
          ?.textContent,
      ).toBe('2')
    })
  })

  describe('obligatoire ou souhaité, niveau demandé, importance (étape 7, 2026-11-05)', () => {
    it('l’ordre de décision est dans l’aide « ? », plus en bas de page (2026-11-11)', () => {
      // Oracle : « crée un petit bouton point d'interrogation… et explique
      // comment cette page fonctionne ».
      monter(<BesoinsPage />)
      expect(
        screen.queryByText('Dans quel ordre le planning décide'),
      ).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Comment ça marche' }))
      const aide = within(screen.getByRole('dialog'))
      for (const titre of [
        'À quoi sert cette page',
        'Le tableau du personnel',
        'Qui compte dans le tableau',
        'Les autres postes',
        'Matin, middle, soir et nuit',
        'Dans quel ordre le planning décide',
      ])
        expect(aide.getByText(titre)).toBeTruthy()
      // Du texte, pas de liste ; aucun nom de poste ; ni tiret cadratin ni « ».
      const dialogue = screen.getByRole('dialog')
      expect(dialogue.querySelector('ul, ol')).toBeNull()
      expect(dialogue.textContent).not.toMatch(/Réception|Club|Veille de nuit/)
      expect(dialogue.textContent).not.toMatch(/[«»—]/)
    })

    it('l’aide s’ouvre aussi en lecture seule', () => {
      etat.droits = { pret: true, lire: true, ecrire: true, gerer: false }
      monter(<BesoinsPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Comment ça marche' }))
      expect(screen.getByRole('dialog')).toBeTruthy()
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
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(service.reglerConsigne).not.toHaveBeenCalled()
  })
})

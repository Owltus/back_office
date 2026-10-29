// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { verifierReglages } from '#/lib/planning/coherence.ts'
import type { PointReglage } from '#/lib/planning/coherence.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import { SEMAINE_TYPE_VIDE } from '#/lib/planning/types.ts'
import type { Referentiel, Salarie } from '#/lib/planning/types.ts'

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

const {
  ConfirmationGeneration,
  PourCommencer,
  blocageGeneration,
  etapesDemarrage,
} = await import('#/components/planning/PretAGenerer.tsx')

afterEach(cleanup)

/*
 * Oracle : un référentiel VIDE, puis les quatre réglages ajoutés un à un
 * dans l'ordre (un code, un poste, une personne sur ce poste, un besoin) ;
 * à chaque pas, la ligne attendue (écrite ici) se coche, et seulement elle.
 */

function vide(): Referentiel {
  return {
    horaires: [],
    motifs: [],
    postes: [],
    groupes: [],
    salaries: [],
    besoins: [],
    consignes: [],
    verrous: [],
  }
}

function personne(id: number, posteId: number): Salarie {
  return {
    id,
    prenom: `Personne${id}`,
    nom: 'Essai',
    groupe_id: null,
    type_contrat: 'cdi',
    heures_hebdo: 35,
    forfait_jours: false,
    mineur: false,
    competences: [{ poste_id: posteId, niveau: 'titulaire' }],
    semaine_type: SEMAINE_TYPE_VIDE.map((e) => ({ ...e })),
    shifts_autorises: [],
    date_entree: null,
    date_sortie: null,
    actif: true,
    suite_de: null,
  }
}

/** Les réglages après n pas (0 à 4). */
function apres(n: number): Referentiel {
  const r = vide()
  if (n >= 1)
    r.horaires.push({
      id: 1,
      code: 'M',
      nom: 'Matin',
      debut: '07:00',
      fin: '15:00',
      couleur: '#888888',
      pause: 0,
      raccourci: 0,
      raccourci_debut: 0,
      periode: 'matin',
      code_rouge: false,
    })
  if (n >= 2)
    r.postes.push({
      id: 1,
      nom: 'Réception',
      categorie: 'reception',
      couleur: '#000000',
      horaires_autorises: [],
      a_part: false,
      presence: false,
    })
  if (n >= 3) r.salaries.push(personne(10, 1))
  if (n >= 4)
    r.besoins.push({
      id: 1,
      poste_id: 1,
      jour: 0,
      horaire_id: 1,
      debut: '07:00',
      fin: '15:00',
      effectif: 1,
      soutien: 0,
      renfort: 0,
    })
  return r
}

const LIGNES = ['1. Horaires', '2. Postes', '3. Équipe', '4. Besoins']

function lignesReglees(): boolean[] {
  return LIGNES.map((debut) =>
    screen
      .getByRole('listitem', { name: new RegExp(`^${debut}`) })
      .getAttribute('aria-label')!
      .endsWith('réglé'),
  )
}

describe('PourCommencer', () => {
  it('référentiel vide : quatre lignes, aucune cochée, quatre boutons', () => {
    const r = vide()
    render(
      <PourCommencer
        etapes={etapesDemarrage(r, verifierReglages(r))}
        onAller={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Pour commencer' })).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(lignesReglees()).toEqual([false, false, false, false])
    expect(screen.getAllByRole('button', { name: /^Régler/ })).toHaveLength(4)
  })

  it('ajout pas à pas : chaque ligne se coche à son tour', () => {
    const attendu = [
      [false, false, false, false],
      [true, false, false, false],
      [true, true, false, false],
      [true, true, true, false],
      [true, true, true, true],
    ]
    for (let n = 0; n <= 4; n++) {
      const r = apres(n)
      const points = verifierReglages(r)
      render(
        <PourCommencer etapes={etapesDemarrage(r, points)} onAller={vi.fn()} />,
      )
      expect(lignesReglees()).toEqual(attendu[n])
      // Plus rien ne bloque seulement à la fin.
      expect(blocageGeneration(points) === null).toBe(n === 4)
      cleanup()
    }
  })

  it('sans poste, Équipe et Besoins ne sont pas cochés (rien ne les signale)', () => {
    const r = apres(1)
    const etapes = etapesDemarrage(r, verifierReglages(r))
    expect(etapes.map((e) => e.fait)).toEqual([true, false, false, false])
    expect(etapes[2].etat).toBe("Créez d'abord les postes.")
  })

  it('le bouton Régler mène au réglage, le premier à faire est mis en avant', () => {
    const onAller = vi.fn()
    const r = apres(2)
    render(
      <PourCommencer
        etapes={etapesDemarrage(r, verifierReglages(r))}
        onAller={onAller}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Régler : Horaires' })).toBe(
      null,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Régler : Équipe' }))
    expect(onAller).toHaveBeenCalledWith({ page: '/planning/equipe' })
  })

  it('le seed fictif est prêt : tout coché, rien ne bloque', () => {
    const { referentiel } = hotelDemo('2026-11-02')
    const points = verifierReglages(referentiel)
    expect(etapesDemarrage(referentiel, points).every((e) => e.fait)).toBe(true)
    expect(blocageGeneration(points)).toBeNull()
  })
})

describe('blocageGeneration', () => {
  it('rend le premier bloquant dans l’ordre de réglage, avec son lien', () => {
    const b = blocageGeneration(verifierReglages(vide()))
    expect(b?.lien.page).toBe('/planning/horaires')
    expect(b?.texte).toMatch(/^Génération impossible/)
    expect(b?.texte).not.toMatch(/«|»|—/)
  })
})

describe('ConfirmationGeneration', () => {
  const points: PointReglage[] = Array.from({ length: 8 }, (_, i) => ({
    id: `p${i}`,
    gravite: 'a-voir',
    ecran: 'equipe',
    texte: `Point ${i}`,
    lien: { page: '/planning/equipe' },
  }))

  it('points repliés, puis dépliés ; Générer quand même lance', () => {
    const onGenerer = vi.fn()
    render(
      <ConfirmationGeneration
        ouvert
        points={points}
        onFermer={vi.fn()}
        onGenerer={onGenerer}
        onAller={vi.fn()}
      />,
    )
    expect(
      screen.getByText(/8 points à vérifier dans les réglages/),
    ).toBeTruthy()
    expect(screen.getByText(/restent des propositions/)).toBeTruthy()
    expect(screen.queryByText('Point 0')).toBeNull()
    const deplier = screen.getByRole('button', {
      name: 'Voir les 8 points à vérifier',
    })
    expect(deplier.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(deplier)
    expect(screen.getByText('Point 0')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Générer quand même' }))
    expect(onGenerer).toHaveBeenCalledTimes(1)
  })
})

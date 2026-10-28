import { describe, expect, it } from 'vitest'

import {
  horairesAAjouter,
  lignesDuPoste,
} from '#/components/planning/parametres/reglages/besoins.ts'
import {
  erreursHoraire,
  erreursMotif,
  erreursPoste,
  memes,
  normaliserHeure,
} from '#/components/planning/parametres/reglages/validation.ts'
import type { SaisieHoraire } from '#/components/planning/parametres/reglages/validation.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'

const referentielDemo = () => hotelDemo('2026-11-02').referentiel

const matin: SaisieHoraire = {
  code: 'M',
  nom: 'Matin',
  debut: '07:00',
  fin: '15:45',
  couleur: '#3b82f6',
  pause: 45,
  raccourci: 60,
  raccourci_debut: 0,
  periode: null,
  code_rouge: false,
}

describe('contrôles de saisie (miroir des contraintes de la base)', () => {
  it('un horaire valide, de nuit ou finissant à 24:00, passe', () => {
    expect(erreursHoraire(matin)).toEqual([])
    expect(erreursHoraire({ ...matin, debut: '23:00', fin: '07:45' })).toEqual(
      [],
    )
    expect(erreursHoraire({ ...matin, debut: '16:00', fin: '24:00' })).toEqual(
      [],
    )
  })

  it('les refus, avec leurs messages', () => {
    expect(erreursHoraire({ ...matin, code: '' })).toContain(
      'Le code fait de 1 à 4 caractères.',
    )
    expect(erreursHoraire({ ...matin, code: 'ABCDE' })).toContain(
      'Le code fait de 1 à 4 caractères.',
    )
    expect(erreursHoraire({ ...matin, nom: ' ' })).toContain(
      "Donnez un nom à l'horaire.",
    )
    expect(erreursHoraire({ ...matin, debut: '7h' })).toContain(
      'Heure de début au format HH:MM.',
    )
    expect(erreursHoraire({ ...matin, fin: '24:30' })).toContain(
      'Heure de fin au format HH:MM (ou 24:00).',
    )
    expect(erreursHoraire({ ...matin, pause: 181 })).toContain(
      'La pause va de 0 à 180 minutes.',
    )
    expect(erreursHoraire({ ...matin, pause: Number.NaN })).toContain(
      'La pause va de 0 à 180 minutes.',
    )
    expect(erreursHoraire({ ...matin, fin: '07:45', pause: 45 })).toContain(
      "La pause doit être plus courte que l'horaire.",
    )
    expect(erreursHoraire({ ...matin, raccourci: 480 - 1 })).toContain(
      'La journée courte retire de 0 à 240 minutes.',
    )
    expect(
      erreursHoraire({ ...matin, fin: '10:00', raccourci: 135 }),
    ).toContain('La journée courte doit garder du temps de travail.')
    expect(erreursHoraire({ ...matin, fin: '10:00', raccourci: 134 })).toEqual(
      [],
    )
    expect(erreursHoraire({ ...matin, raccourci_debut: 75 })).toContain(
      'Le raccourci du début ne peut pas dépasser le raccourci total.',
    )
    expect(erreursHoraire({ ...matin, couleur: 'bleu' })).toContain(
      'Choisissez une couleur.',
    )
  })

  it('motif et poste', () => {
    const motif = {
      code: 'CP',
      nom: 'Congés',
      couleur: '#22c55e',
      decompte: true,
      nature: 'absence' as const,
    }
    expect(erreursMotif(motif)).toEqual([])
    expect(erreursMotif({ ...motif, code: 'TROPLONG' })).toContain(
      'Le code fait de 1 à 4 caractères.',
    )
    const poste = {
      nom: 'Bar',
      categorie: 'autre' as const,
      couleur: '#22c55e',
      horaires_autorises: [],
      a_part: false,
      presence: false,
    }
    expect(erreursPoste(poste)).toEqual([])
    expect(erreursPoste({ ...poste, nom: '' })).toContain(
      'Donnez un nom au poste.',
    )
  })

  it('heures tapées vite', () => {
    expect(normaliserHeure('7')).toBe('07:00')
    expect(normaliserHeure('7:30')).toBe('07:30')
    expect(normaliserHeure('730')).toBe('07:30')
    expect(normaliserHeure('7h15')).toBe('07:15')
    expect(normaliserHeure('24:00')).toBe('24:00')
    expect(normaliserHeure('abc')).toBe('abc')
  })

  it('memes compare champ par champ, tableaux compris', () => {
    expect(memes({ a: 1, l: [1, 2] }, { a: 1, l: [1, 2] })).toBe(true)
    expect(memes({ a: 1, l: [1, 2] }, { a: 1, l: [2, 1] })).toBe(false)
  })
})

describe('lignes du tableau des besoins', () => {
  it('horaires demandés, gardés dans la séance, et non permis encore demandés', () => {
    const ref = referentielDemo()
    const club = ref.postes.find((p) => p.nom === 'Club')
    if (!club) throw new Error('Club')
    const siens = ref.besoins.filter((b) => b.poste_id === club.id)
    const possibles = ref.horaires.filter((h) =>
      club.horaires_autorises.includes(h.id),
    )
    const rien = new Set<string>()
    const lignes = lignesDuPoste(siens, ref.horaires, rien)
    expect(lignes.map((l) => l.cle)).toEqual(['t1', 't3'])
    expect(horairesAAjouter(possibles, lignes).map((h) => h.id)).toEqual([2])
    // Ajouté par l'utilisateur : sa ligne apparaît, vide.
    expect(
      lignesDuPoste(siens, ref.horaires, new Set(['t2'])).map((l) => l.cle),
    ).toEqual(['t1', 't2', 't3'])
    // Remis à 0 partout : la ligne n'est plus montrée, sauf si gardée.
    const aZero = siens.map((b) =>
      b.horaire_id === 1 ? { ...b, effectif: 0, soutien: 0, renfort: 0 } : b,
    )
    expect(lignesDuPoste(aZero, ref.horaires, rien).map((l) => l.cle)).toEqual([
      't3',
    ])
    expect(
      lignesDuPoste(aZero, ref.horaires, new Set(['t1'])).map((l) => l.cle),
    ).toEqual(['t1', 't3'])
    // Un horaire spécifique : sa propre ligne, triée par début.
    const specifique = {
      ...siens[0],
      id: 500,
      horaire_id: null,
      debut: '12:00',
      fin: '14:00',
    }
    expect(
      lignesDuPoste([...siens, specifique], ref.horaires, rien).map(
        (l) => l.cle,
      ),
    ).toEqual(['t1', 'h12:00-14:00', 't3'])
  })
})

import { describe, expect, it } from 'vitest'

import {
  horairesAAjouter,
  lignesDuPoste,
} from '#/components/planning/parametres/reglages/besoins.ts'
import {
  changerHeures,
  codePropose,
  erreursHoraire,
  erreursMotif,
  erreursPoste,
  horaireAuxMemesHeures,
  memes,
  momentEstPropose,
  nettoyerHoraire,
  nettoyerMotif,
  normaliserHeure,
} from '#/components/planning/parametres/reglages/validation.ts'
import type { SaisieHoraire } from '#/components/planning/parametres/reglages/validation.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'

const referentielDemo = () => hotelDemo('2026-11-02').referentiel

const matin: SaisieHoraire = {
  debut: '07:00',
  fin: '15:45',
  couleur: '#3b82f6',
  pause: 45,
  periode: null,
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
    expect(erreursHoraire({ ...matin, couleur: 'bleu' })).toContain(
      'Choisissez une couleur.',
    )
  })

  it("deux horaires aux mêmes heures : refusé avant l'envoi", () => {
    const enregistres = [
      { id: 1, debut: '07:00', fin: '15:45' },
      { id: 2, debut: '16:00', fin: '00:00' },
    ]
    // Nouveau (id null) aux heures d'un horaire existant : refusé.
    expect(erreursHoraire(matin, enregistres, null)).toContain(
      'Cet horaire existe déjà.',
    )
    // L'horaire lui-même, rouvert : accepté.
    expect(erreursHoraire(matin, enregistres, 1)).toEqual([])
    // Mêmes heures de début, autre fin : accepté.
    expect(
      erreursHoraire({ ...matin, fin: '15:30' }, enregistres, null),
    ).toEqual([])
    // Une fin à 24:00 vaut une fin à minuit.
    expect(
      horaireAuxMemesHeures({ debut: '16:00', fin: '24:00' }, enregistres, null)
        ?.id,
    ).toBe(2)
    // Heures incomplètes : rien à comparer (le format est dit à part).
    expect(
      horaireAuxMemesHeures({ debut: '07:0', fin: '15:45' }, enregistres, null),
    ).toBeUndefined()
  })

  it('le moment suit TOUJOURS les heures (2026-11-05)', () => {
    const nuit = changerHeures(matin, { debut: '23:00', fin: '07:45' })
    expect(nuit).toEqual({ debut: '23:00', fin: '07:45', periode: 'nuit' })
    expect(momentEstPropose({ ...matin, ...nuit })).toBe(true)
    // Un moment ancien, choisi à la main, ne survit pas aux heures.
    expect(
      changerHeures(
        { ...matin, periode: 'middle' },
        { debut: '23:00', fin: '07:45' },
      ),
    ).toEqual({ debut: '23:00', fin: '07:45', periode: 'nuit' })
    // Heure en cours de frappe : rien à calculer.
    expect(changerHeures(matin, { fin: '15:4' })).toEqual({
      fin: '15:4',
    })
    // Plus de moment « court » (2026-10-31) : moins de 7 h de travail, il
    // reste rangé d'après son début.
    expect(changerHeures(matin, { pause: 120 }).periode).toBe('matin')
    expect(momentEstPropose({ ...matin, periode: 'soir' })).toBe(false)
    // L'enregistrement écrit le moment des heures, jamais celui de la saisie.
    expect(nettoyerHoraire({ ...matin, periode: 'nuit' }).periode).toBe('matin')
  })

  it("le nom rangé en base est écrit par l'app, d'après les heures", () => {
    const valeurs = nettoyerHoraire({ ...matin, periode: 'matin' })
    expect(valeurs.nom).toBe('Matin de 7 h à 15 h 45')
    expect('code' in valeurs).toBe(false)
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
    // MI, et les versions étoile du Club (2026-11-02), rangées par heures.
    expect(horairesAAjouter(possibles, lignes).map((h) => h.id)).toEqual([
      8, 9, 2, 10,
    ])
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

describe("code d'un motif proposé d'après le nom (U10 du 2026-11-01)", () => {
  it("initiales, ou deux lettres d'un mot seul", () => {
    expect(codePropose('Congé payé')).toBe('CP')
    expect(codePropose('Maladie')).toBe('MA')
    expect(codePropose('Absence autorisée rémunérée')).toBe('AAR')
    expect(codePropose('Repos de récupération')).toBe('RR')
    expect(codePropose('  ')).toBe('AB')
  })
  it("un code vide est rempli à l'enregistrement, un code tapé est gardé", () => {
    const m = {
      code: '',
      nom: 'Formation',
      couleur: '#000000',
      decompte: true,
      nature: 'absence' as const,
    }
    expect(erreursMotif(m)).toEqual([])
    expect(nettoyerMotif(m).code).toBe('FO')
    expect(nettoyerMotif({ ...m, code: 'fx' }).code).toBe('FX')
    // Refusé : un code tapé trop long reste une erreur.
    expect(erreursMotif({ ...m, code: 'ABCDE' })).toContain(
      'Le code fait de 1 à 4 caractères.',
    )
  })
})

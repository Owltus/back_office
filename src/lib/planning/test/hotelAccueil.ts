/*
 * Un hôtel FICTIF de taille réelle pour le tableau de l'accueil (plan
 * planning-accueil-2026-11-01, étape 3) : 20 personnes, 7 postes, 35
 * horaires, Réception et Club cochés « présence », une Veille de nuit, et
 * quatre postes à part. Pseudonymes seulement, aucune donnée réelle.
 *
 * `accueil: false` rend le MÊME hôtel sans poste coché « présence » : le
 * moteur d'avant le 2026-11-01 (besoins de la Réception, du Club et de la
 * Veille), pour mesurer avant / après.
 */

import type {
  Besoin,
  Consigne,
  Horaire,
  JourType,
  Niveau,
  Periode,
  Poste,
  Referentiel,
  Salarie,
  TypeContrat,
} from '#/lib/planning/types.ts'

// (nom, début, fin, pause, moment). Plus de raccourci (2026-11-02) : la
// journée étoile d'un 39 h prend un horaire de 7 h qui existe (M8, S5, S9).
const HORAIRES: Array<[string, string, string, number, Periode | null]> = [
  // 10 matins
  ['M1', '06:00', '14:45', 45, 'matin'],
  ['M2', '06:30', '15:15', 45, 'matin'],
  ['M3', '07:00', '15:45', 45, 'matin'],
  ['M4', '07:30', '16:15', 45, 'matin'],
  ['M5', '08:00', '16:45', 45, 'matin'],
  ['M6', '06:30', '14:00', 30, 'matin'],
  ['M7', '07:00', '14:00', 30, 'matin'],
  ['M8', '08:00', '15:45', 45, 'matin'],
  ['M9', '09:00', '17:45', 45, 'matin'],
  ['M10', '06:45', '15:30', 45, 'matin'],
  // 10 soirs
  ['S1', '14:00', '22:45', 45, 'soir'],
  ['S2', '14:30', '23:15', 45, 'soir'],
  ['S3', '15:00', '23:45', 45, 'soir'],
  ['S4', '15:15', '00:00', 45, 'soir'],
  ['S5', '16:00', '23:45', 45, 'soir'],
  ['S6', '15:00', '22:00', 30, 'soir'],
  ['S7', '13:30', '22:15', 45, 'soir'],
  ['S8', '14:45', '23:30', 45, 'soir'],
  ['S9', '16:30', '00:00', 30, 'soir'],
  ['S10', '17:00', '23:00', 30, 'soir'],
  // 5 middles
  ['MI1', '10:00', '18:45', 45, 'middle'],
  ['MI2', '11:00', '19:45', 45, 'middle'],
  ['MI3', '12:00', '20:45', 45, 'middle'],
  ['MI4', '09:30', '18:15', 45, 'middle'],
  ['MI5', '11:30', '20:15', 45, 'middle'],
  // 3 nuits
  ['N1', '23:00', '07:00', 0, 'nuit'],
  ['N2', '22:30', '07:00', 30, 'nuit'],
  ['N3', '23:30', '07:30', 0, 'nuit'],
  // 7 sans moment (postes à part)
  ['D1', '08:00', '18:00', 60, null],
  ['D2', '09:00', '19:00', 60, null],
  ['AD', '10:30', '19:15', 45, null],
  ['SU1', '12:30', '21:15', 45, null],
  ['SU2', '13:00', '21:45', 45, null],
  ['T', '07:45', '16:30', 45, null],
  ['TV', '08:00', '15:30', 45, null],
]

const JOUR_ACCUEIL = [
  'M2',
  'M3',
  'M4',
  'M5',
  'M7',
  'M8',
  'M10',
  'S1',
  'S2',
  'S3',
  'S4',
  'S6',
  'S7',
  'S8',
  'MI1',
  'MI2',
  'MI4',
]
const CLUB = [
  'M3',
  'M5',
  'M6',
  'M8',
  'M9',
  'S1',
  'S3',
  'S5',
  'S9',
  'S10',
  'MI2',
]
// (nom, catégorie, horaires, à part, présence)
const POSTES: Array<[string, Poste['categorie'], string[], boolean, boolean]> =
  [
    ['Direction', 'autre', ['D1', 'D2'], true, false],
    ['Adjoint', 'autre', ['AD', 'M3', 'S3'], true, false],
    ['Supervision', 'reception', ['SU1', 'SU2', 'MI3'], true, false],
    ['Réception', 'reception', JOUR_ACCUEIL, false, true],
    ['Club', 'autre', CLUB, false, true],
    ['Veille de nuit', 'veille_nuit', ['N1', 'N2', 'N3'], false, false],
    ['Technique', 'autre', ['T', 'TV'], true, false],
  ]

const T: Niveau = 'titulaire'
const OC: Niveau = 'occasionnel'
const S: Niveau = 'soutien'
const SEMAINE = [0, 1, 2, 3, 4]
const TOUS = [0, 1, 2, 3, 4, 5, 6]

// (prénom, contrat, heures, compétences, repos fixes, forfait)
const STAFF: Array<
  [string, TypeContrat, number, Record<string, Niveau>, number[], boolean?]
> = [
  ['Ariane', 'cdi', 35, { Direction: T }, [5, 6], true],
  ['Basile', 'cdi', 39, { Adjoint: T, Réception: OC, Club: OC }, [0, 6]],
  ['Céleste', 'cdi', 39, { Adjoint: T, Réception: OC, Club: OC }, [4, 5]],
  ['Dorian', 'cdi', 39, { Supervision: T, Réception: OC, Club: OC }, []],
  ['Eliot', 'cdi', 39, { Technique: T }, [5, 6]],
  ['Fanny', 'cdi', 39, { Réception: T, Club: T }, []],
  ['Gaspard', 'cdi', 39, { Réception: T, Club: T }, []],
  ['Hortense', 'extra', 0, { Réception: OC, Club: OC }, []],
  ['Ilian', 'cdd', 28, { Réception: T, Club: T }, []],
  ['Jade', 'cdi', 39, { Réception: T }, []],
  ['Kilian', 'cdi', 35, { Réception: T, Club: T }, []],
  ['Léna', 'cdd', 35, { Club: T, Réception: OC }, []],
  ['Malo', 'extra', 0, { Réception: OC, Club: OC }, []],
  ['Noé', 'extra', 0, { Réception: OC, Club: OC }, []],
  ['Oriane', 'cdi', 39, { 'Veille de nuit': T }, []],
  ['Pacôme', 'cdi', 30, { 'Veille de nuit': T, Réception: OC }, []],
  ['Quitterie', 'apprenti', 35, { Réception: S, Club: S }, []],
  ['Romane', 'stagiaire', 35, { Réception: S, Club: S }, []],
  ['Sacha', 'extra', 0, { Réception: OC, Club: OC, 'Veille de nuit': OC }, []],
  ['Tess', 'extra', 0, { Réception: OC, Club: OC }, []],
]

/** Chiffre de l'accueil d'un moment (tableau, minimum = maximum). */
export function chiffreHotelAccueil(
  jour: number,
  periode: 'matin' | 'soir' | 'nuit',
): number {
  if (periode === 'nuit') return 1
  if (periode === 'matin') return 3
  return jour >= 4 ? 3 : 2
}

export function hotelAccueil(accueil = true): Referentiel {
  const horaires: Horaire[] = HORAIRES.map(
    ([nom, debut, fin, pause, periode], i) => ({
      id: i + 1,
      nom,
      debut,
      fin,
      couleur: '#000000',
      pause,
      periode,
    }),
  )
  const idH = (n: string) => {
    const h = horaires.find((x) => x.nom === n)
    if (!h) throw new Error(`horaire ${n}`)
    return h.id
  }
  const postes: Poste[] = POSTES.map(
    ([nom, categorie, codes, , presence], i) => ({
      id: i + 1,
      nom,
      categorie,
      couleur: '#000000',
      horaires_autorises: codes.map(idH),
      presence: accueil && presence,
    }),
  )
  const idP = (n: string) => {
    const p = postes.find((x) => x.nom === n)
    if (!p) throw new Error(`poste ${n}`)
    return p.id
  }
  let nb = 0
  const besoins: Besoin[] = []
  const besoin = (
    poste: string,
    code: string,
    jours: number[],
    effectif: number,
    renfort = 0,
    soutien = 0,
  ) => {
    const h = horaires[idH(code) - 1]
    for (const jour of jours)
      besoins.push({
        id: ++nb,
        poste_id: idP(poste),
        jour,
        horaire_id: h.id,
        debut: h.debut,
        fin: h.fin,
        effectif,
        soutien,
        renfort,
      })
  }
  // Postes à part : inchangés avec ou sans tableau.
  besoin('Direction', 'D1', SEMAINE, 0, 1)
  besoin('Adjoint', 'AD', TOUS, 0, 1)
  besoin('Supervision', 'SU1', SEMAINE, 1)
  besoin('Technique', 'T', [0, 1, 2, 3], 1)
  besoin('Technique', 'TV', [4], 1)
  // Accueil : les besoins d'avant (ignorés quand le tableau est en
  // service, D13), au même chiffre que le tableau.
  besoin('Réception', 'M3', TOUS, 1, 0, 1)
  besoin('Club', 'M5', TOUS, 1, 0, 1)
  besoin('Réception', 'M2', TOUS, 1)
  besoin('Club', 'S1', [4, 5, 6], 1)
  besoin('Réception', 'S2', TOUS, 1, 0, 1)
  besoin('Club', 'S3', TOUS, 1)
  besoin('Réception', 'MI2', TOUS, 0, 1)
  besoin('Veille de nuit', 'N1', TOUS, 1)

  const consignes: Consigne[] = []
  let nc = 0
  for (const jour of TOUS)
    for (const periode of ['matin', 'soir', 'nuit'] as const) {
      const n = chiffreHotelAccueil(jour, periode)
      consignes.push({ id: ++nc, jour, periode, minimum: n, maximum: n })
    }

  const salaries: Salarie[] = STAFF.map(
    ([prenom, contrat, heures, competences, repos, forfait], i) => {
      const semaine: JourType[] = TOUS.map((j) => ({
        mode: repos.includes(j) ? 'repos' : 'auto',
      }))
      return {
        id: i + 1,
        prenom,
        nom: 'Essai',
        groupe_id: null,
        type_contrat: contrat,
        heures_hebdo: heures,
        forfait_jours: forfait ?? false,
        mineur: false,
        competences: Object.entries(competences).map(([p, niveau]) => ({
          poste_id: idP(p),
          niveau,
        })),
        semaine_type: semaine,
        shifts_autorises: [],
        date_entree: null,
        date_sortie: null,
        actif: true,
        suite_de: null,
      }
    },
  )
  return {
    horaires,
    motifs: [],
    postes,
    groupes: [],
    salaries,
    besoins,
    consignes: accueil ? consignes : [],
    verrous: [],
  }
}

/*
 * L'hôtel FICTIF des tests du prototype (`backend/src/planning/demo.py`),
 * en mémoire, pour les tests du cœur planning. Mêmes données que le seed
 * local (`supabase/seed/generer.ts`, `genererPlanning`).
 */

import { ajouterJours } from '#/lib/planning/temps.ts'
import type {
  Absence,
  Besoin,
  Groupe,
  Horaire,
  JourType,
  Motif,
  Poste,
  Referentiel,
  Salarie,
  TypeContrat,
} from '#/lib/planning/types.ts'

const HORAIRES: Array<[string, string, string, string, number, number]> = [
  ['M', 'Matin', '07:00', '15:45', 45, 60],
  ['MI', 'Middle', '09:00', '17:45', 45, 60],
  ['AM', 'Après-midi', '15:00', '23:45', 45, 60],
  ['N', 'Nuit', '23:00', '07:45', 45, 60],
  ['D', 'Direction', '08:00', '18:00', 60, 0],
  ['T', 'Technique', '08:00', '16:45', 45, 0],
  ['TV', 'Technique vendredi', '08:00', '15:45', 45, 0],
]
const MOTIFS: Array<[string, string, boolean, 'absence' | 'ecole']> = [
  ['CP', 'Congés', true, 'absence'],
  ['EC', 'École', true, 'ecole'],
  ['MA', 'Maladie', true, 'absence'],
  ['RP', 'Repos', true, 'absence'],
  ['FO', 'Formation', true, 'absence'],
]
const POSTES: Array<[string, Poste['categorie'], string[]]> = [
  ['Direction', 'autre', ['D']],
  ['Réception', 'reception', ['M', 'MI', 'AM']],
  ['Club', 'autre', ['M', 'MI', 'AM']],
  ['Veille de nuit', 'veille_nuit', ['N']],
  ['Responsable technique', 'autre', ['T', 'TV']],
]
const TOUS = [0, 1, 2, 3, 4, 5, 6]
const BESOINS: Array<[string, string, number[], number, number]> = [
  ['Réception', 'M', TOUS, 1, 0],
  ['Réception', 'MI', TOUS, 0, 1],
  ['Réception', 'AM', TOUS, 1, 0],
  ['Club', 'M', TOUS, 1, 0],
  ['Club', 'AM', TOUS, 1, 0],
  ['Veille de nuit', 'N', TOUS, 1, 0],
  ['Direction', 'D', [0, 1, 2, 3, 4], 0, 1],
  ['Responsable technique', 'T', [0, 1, 2, 3], 0, 1],
  ['Responsable technique', 'TV', [4], 0, 1],
]
const GROUPES: Array<[string, string, string[]]> = [
  [
    'direction',
    'Direction',
    [
      'Direction',
      'Réception',
      'Club',
      'Veille de nuit',
      'Responsable technique',
    ],
  ],
  ['hotelier', 'Hôteliers', ['Réception', 'Club', 'Veille de nuit']],
  ['apprenti', 'Apprentis', ['Réception', 'Club']],
  ['stagiaire', 'Stagiaires', ['Réception', 'Club']],
]
interface Options {
  forfait?: boolean
  repos?: number[]
  horaires?: string[]
  impose?: Record<number, string>
  absence?: [number, number, string]
  alternance?: [number, number, number]
}
const STAFF: Array<
  [string, string, string, TypeContrat, number, Record<string, string>, Options]
> = [
  [
    'direction',
    'Claire',
    'Martin',
    'cdi',
    39,
    { Direction: 'titulaire' },
    {
      forfait: true,
      repos: [5, 6],
      horaires: ['D'],
      impose: { 0: 'D', 1: 'D', 2: 'D', 3: 'D', 4: 'D' },
    },
  ],
  [
    'direction',
    'Sophie',
    'Bernard',
    'cdi',
    39,
    { Réception: 'titulaire', Club: 'occasionnel' },
    {},
  ],
  [
    'hotelier',
    'Lucas',
    'Petit',
    'cdi',
    39,
    { Réception: 'titulaire', Club: 'titulaire' },
    {},
  ],
  [
    'hotelier',
    'Nadia',
    'Haddad',
    'cdi',
    39,
    { Réception: 'titulaire', Club: 'titulaire' },
    {},
  ],
  [
    'hotelier',
    'Emma',
    'Durand',
    'cdi',
    39,
    { Réception: 'titulaire', Club: 'occasionnel' },
    { absence: [2, 2, 'CP'] },
  ],
  [
    'hotelier',
    'Thomas',
    'Moreau',
    'cdi',
    39,
    { Club: 'titulaire', Réception: 'occasionnel' },
    {
      repos: [0, 6],
      horaires: ['AM'],
      impose: { 1: 'AM', 2: 'AM', 3: 'AM', 4: 'AM', 5: 'AM' },
    },
  ],
  [
    'hotelier',
    'Karim',
    'Benali',
    'cdi',
    39,
    { 'Veille de nuit': 'titulaire' },
    { horaires: ['N'] },
  ],
  [
    'hotelier',
    'Yannis',
    'Roux',
    'cdi',
    39,
    { 'Veille de nuit': 'titulaire', Réception: 'titulaire' },
    {
      repos: [0, 6],
      horaires: ['AM', 'N'],
      impose: { 1: 'AM', 2: 'AM', 3: 'AM', 4: 'N', 5: 'N' },
    },
  ],
  [
    'direction',
    'Marc',
    'Leroy',
    'cdi',
    39,
    { 'Responsable technique': 'titulaire' },
    {
      repos: [5, 6],
      horaires: ['T', 'TV'],
      impose: { 0: 'T', 1: 'T', 2: 'T', 3: 'T', 4: 'TV' },
    },
  ],
  [
    'stagiaire',
    'Léa',
    'Fontaine',
    'stagiaire',
    35,
    { Réception: 'soutien', Club: 'soutien' },
    { absence: [14, 18, 'EC'] },
  ],
  [
    'apprenti',
    'Chloé',
    'Lambert',
    'apprenti',
    35,
    { Réception: 'titulaire', Club: 'soutien' },
    { alternance: [0, 2, 2] },
  ],
  [
    'apprenti',
    'Inès',
    'Garnier',
    'apprenti',
    35,
    { Club: 'titulaire', Réception: 'soutien' },
    { alternance: [2, 2, 2] },
  ],
]

/** L'hôtel fictif, avec `lundi` comme « lundi prochain » du prototype. */
export function hotelDemo(lundi: string): {
  referentiel: Referentiel
  absences: Absence[]
} {
  const horaires: Horaire[] = HORAIRES.map(
    ([code, nom, debut, fin, pause, raccourci], i) => ({
      id: i + 1,
      code,
      nom,
      debut,
      fin,
      couleur: '#000000',
      pause,
      raccourci,
      raccourci_debut: 0,
    }),
  )
  const idH = (c: string) => (horaires.find((h) => h.code === c) as Horaire).id
  const motifs: Motif[] = MOTIFS.map(([code, nom, decompte, nature], i) => ({
    id: i + 1,
    code,
    nom,
    couleur: '#000000',
    decompte,
    nature,
  }))
  const idM = (c: string) => (motifs.find((m) => m.code === c) as Motif).id
  const postes: Poste[] = POSTES.map(([nom, categorie, codes], i) => ({
    id: i + 1,
    nom,
    categorie,
    couleur: '#000000',
    horaires_autorises: codes.map(idH),
    a_part: false,
  }))
  const idP = (n: string) => (postes.find((p) => p.nom === n) as Poste).id
  const groupes: Groupe[] = GROUPES.map(([, nom, permis], i) => ({
    id: i + 1,
    nom,
    ordre: i,
    postes_autorises: permis.map(idP),
  }))
  const idG = (code: string) => GROUPES.findIndex((g) => g[0] === code) + 1
  let n = 0
  const besoins: Besoin[] = []
  for (const [poste, code, jours, effectif, renfort] of BESOINS) {
    const h = horaires[idH(code) - 1]
    for (const j of jours) {
      besoins.push({
        id: ++n,
        poste_id: idP(poste),
        jour: j,
        horaire_id: h.id,
        debut: h.debut,
        fin: h.fin,
        effectif,
        soutien: 1,
        renfort,
      })
    }
  }
  const salaries: Salarie[] = []
  const absences: Absence[] = []
  let na = 0
  STAFF.forEach(
    ([groupe, prenom, nom, contrat, heures, competences, opt], i) => {
      const semaine: JourType[] = TOUS.map((j) => {
        const impose = opt.impose?.[j]
        if (impose) return { mode: 'travail', type_shift_id: idH(impose) }
        if (opt.repos?.includes(j)) return { mode: 'repos' }
        return { mode: 'auto' }
      })
      const id = i + 1
      salaries.push({
        id,
        prenom,
        nom,
        groupe_id: idG(groupe),
        type_contrat: contrat,
        heures_hebdo: heures,
        forfait_jours: opt.forfait ?? false,
        mineur: false,
        competences: Object.entries(competences).map(([p, niveau]) => ({
          poste_id: idP(p),
          niveau: niveau as 'titulaire',
        })),
        semaine_type: semaine,
        shifts_autorises: (opt.horaires ?? []).map(idH),
        date_entree: null,
        date_sortie: null,
        actif: true,
        suite_de: null,
      })
      const jours = new Map<string, number>()
      if (opt.absence) {
        const [de, a, code] = opt.absence
        for (let j = de; j <= a; j++)
          jours.set(ajouterJours(lundi, j), idM(code))
      }
      if (opt.alternance) {
        const [decalage, ecole, hotel] = opt.alternance
        for (let k = 0; k < 26; k++) {
          if (k >= decalage && (k - decalage) % (ecole + hotel) < ecole) {
            for (let j = 0; j < 5; j++)
              jours.set(ajouterJours(lundi, 7 * k + j), idM('EC'))
          }
        }
      }
      for (const [jour, motif] of jours)
        absences.push({ id: ++na, salarie_id: id, jour, motif_id: motif })
    },
  )
  return {
    referentiel: {
      horaires,
      motifs,
      postes,
      groupes,
      salaries,
      besoins,
      verrous: [],
    },
    absences,
  }
}

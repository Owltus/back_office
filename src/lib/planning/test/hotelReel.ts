/*
 * L'hôtel « réel » du prototype (`backend/src/planning/hotel.py`,
 * `PLANNING_JEU=hotel`) : mêmes codes horaires, postes, besoins, catégories
 * et fiches, en mémoire, pour porter les tests du prototype qui s'appuient
 * sur lui. Les prénoms et les noms sont REMPLACÉS par des pseudonymes (pas de
 * vrais noms dans le dépôt, aucune correspondance notée). Les semaines
 * relevées S40 et S42 (plannings imprimés) ne sont pas reprises : les tests
 * qui en ont besoin posent eux-mêmes les quelques shifts concernés.
 */

import { ajouterJours } from '#/lib/planning/temps.ts'
import type {
  Absence,
  Besoin,
  Groupe,
  Horaire,
  JourType,
  Motif,
  Niveau,
  Poste,
  Referentiel,
  Salarie,
  TypeContrat,
} from '#/lib/planning/types.ts'

// (code, nom, début, fin, pause, raccourci[, dont au début])
const HORAIRES: Array<
  [string, string, string, string, number, number, number?]
> = [
  ['M', 'Matin', '07:00', '15:45', 45, 60],
  ['MI', 'Middle', '11:00', '19:45', 45, 60],
  ['S', 'Soir', '14:30', '23:15', 45, 60, 30],
  ['SD', 'Soir du dimanche', '15:15', '00:00', 45, 0],
  ['N', 'Nuit', '23:00', '07:00', 0, 60, 60],
  ['D', 'Direction', '08:00', '18:00', 15, 0],
  ['AD', 'Adjoint de direction', '11:00', '19:45', 45, 60],
  ['SR', 'Supervision', '12:00', '20:45', 45, 60],
  ['T', 'Technique', '08:00', '16:45', 45, 60],
]
// (code, nom, compté dans les heures, nature)
const MOTIFS: Array<[string, string, boolean, 'absence' | 'ecole']> = [
  ['CP', 'Congé payé', true, 'absence'],
  ['EC', 'École - CFA', true, 'ecole'],
  ['MA', 'Maladie', true, 'absence'],
  ['FO', 'Formation', true, 'absence'],
  ['RP', 'Repos exceptionnel', false, 'absence'],
  ['SS', 'Sans solde', true, 'absence'],
]
const ACCUEIL = ['Réception', 'Club']
const JOUR = ['M', 'MI', 'S', 'SD']
const POSTES: Array<[string, Poste['categorie'], string[], boolean]> = [
  ['Direction', 'autre', ['D'], true],
  ['Adjoint de direction', 'autre', ['AD', 'M', 'S', 'SD'], true],
  ['Supervision réception', 'reception', ['SR', 'M', 'MI', 'S'], true],
  ['Réception', 'reception', JOUR, false],
  ['Club', 'autre', JOUR, false],
  ['Veille de nuit', 'veille_nuit', ['N'], false],
  ['Responsable technique', 'autre', ['T'], true],
]
const SEMAINE = [0, 1, 2, 3, 4]
const TOUS = [0, 1, 2, 3, 4, 5, 6]
const SAUF_DIMANCHE = [0, 1, 2, 3, 4, 5]
const BESOINS: Array<[string, string, number[], number, number]> = [
  ['Réception', 'M', TOUS, 1, 0],
  ['Club', 'M', TOUS, 1, 0],
  ['Réception', 'MI', TOUS, 0, 1],
  ['Réception', 'S', SAUF_DIMANCHE, 1, 0],
  ['Réception', 'SD', [6], 1, 0],
  ['Club', 'S', TOUS, 1, 0],
  ['Veille de nuit', 'N', TOUS, 1, 0],
  ['Direction', 'D', SEMAINE, 0, 1],
  ['Adjoint de direction', 'AD', TOUS, 0, 1],
  ['Adjoint de direction', 'M', TOUS, 0, 1],
  ['Adjoint de direction', 'S', SAUF_DIMANCHE, 0, 1],
  ['Adjoint de direction', 'SD', [6], 0, 1],
  ['Supervision réception', 'SR', TOUS, 0, 1],
  ['Supervision réception', 'M', TOUS, 0, 1],
  ['Supervision réception', 'S', TOUS, 0, 1],
  ['Responsable technique', 'T', SEMAINE, 0, 1],
]
const GROUPES: Array<[string, string, string[]]> = [
  ['direction', 'Direction', POSTES.map((p) => p[0])],
  [
    'hotelier',
    'Hôteliers',
    ['Supervision réception', ...ACCUEIL, 'Veille de nuit'],
  ],
  ['apprenti', 'Apprentis', ACCUEIL],
  ['stagiaire', 'Stagiaires', ACCUEIL],
  ['extra', 'Extras', [...ACCUEIL, 'Veille de nuit']],
]

const T: Niveau = 'titulaire'
const OC: Niveau = 'occasionnel'
const S: Niveau = 'soutien'
const HOTELIER = { Réception: T, Club: T }

interface Options {
  forfait?: boolean
  repos?: number[]
  travail?: number[]
  horaires?: string[]
  impose?: Record<number, string>
  etoile?: number[]
  /** (premier lundi d'école, semaines d'école, semaines à l'hôtel) */
  alternanceDepuis?: [string, number, number]
}

// (catégorie, prénom de test, nom, contrat, heures, compétences, options)
// Ordre et contenu de `STAFF` dans hotel.py.
const STAFF: Array<
  [string, string, string, TypeContrat, number, Record<string, Niveau>, Options]
> = [
  // Jeanne : direction au forfait jours.
  [
    'direction',
    'Jeanne',
    'A',
    'cdi',
    35,
    { Direction: T },
    { forfait: true, repos: [5, 6], travail: SEMAINE },
  ],
  // Alice : du mardi au samedi.
  [
    'direction',
    'Alice',
    'B',
    'cdi',
    39,
    { 'Adjoint de direction': T, Réception: OC, Club: OC },
    { repos: [0, 6], travail: [1, 2, 3, 4, 5] },
  ],
  // Laure : du dimanche au jeudi.
  [
    'direction',
    'Laure',
    'C',
    'cdi',
    39,
    { 'Adjoint de direction': T, Réception: OC, Club: OC },
    { repos: [4, 5], travail: [6, 0, 1, 2, 3] },
  ],
  // La superviseuse : superviseuse.
  [
    'hotelier',
    'Capucine',
    'D',
    'cdi',
    39,
    { 'Supervision réception': T, Réception: OC, Club: OC },
    {},
  ],
  // Paul : technicien, étoile le vendredi.
  [
    'direction',
    'Paul',
    'E',
    'cdi',
    39,
    { 'Responsable technique': T },
    {
      repos: [5, 6],
      horaires: ['T'],
      impose: { 0: 'T', 1: 'T', 2: 'T', 3: 'T', 4: 'T' },
      etoile: [4],
    },
  ],
  // Yves : soirs du mardi au jeudi, nuits vendredi et samedi.
  [
    'hotelier',
    'Yves',
    'F',
    'cdi',
    39,
    { ...HOTELIER, 'Veille de nuit': T },
    {
      repos: [0, 6],
      travail: [1, 2, 3],
      horaires: ['S', 'N'],
      impose: { 4: 'N', 5: 'N' },
    },
  ],
  // Théo : le soir, du mardi au samedi.
  [
    'hotelier',
    'Théo',
    'G',
    'cdi',
    39,
    HOTELIER,
    { repos: [0, 6], travail: [1, 2, 3, 4, 5], horaires: ['S'] },
  ],
  ['hotelier', 'Clara', 'H', 'cdi', 39, HOTELIER, {}],
  ['hotelier', 'Agathe', 'I', 'cdi', 39, HOTELIER, {}],
  ['hotelier', 'Antoine', 'J', 'cdi', 39, HOTELIER, {}],
  ['hotelier', 'Lise', 'K', 'cdi', 35, HOTELIER, {}],
  // Yohan : nuits du lundi au jeudi et du dimanche, étoile la nuit du dimanche.
  [
    'hotelier',
    'Yohan',
    'L',
    'cdi',
    39,
    { 'Veille de nuit': T },
    {
      repos: [4, 5],
      horaires: ['N'],
      impose: { 0: 'N', 1: 'N', 2: 'N', 3: 'N', 6: 'N' },
      etoile: [6],
    },
  ],
  // Élise et Lou : alternance 2 / 2 décalée.
  [
    'apprenti',
    'Élise',
    'M',
    'apprenti',
    35,
    { Réception: S, Club: S },
    { alternanceDepuis: ['2026-10-19', 2, 2] },
  ],
  [
    'apprenti',
    'Lou',
    'N',
    'apprenti',
    35,
    { Réception: S, Club: S },
    { alternanceDepuis: ['2026-11-02', 2, 2] },
  ],
  // Extras : Max, Armand, Louna.
  ['extra', 'Max', 'O', 'extra', 0, { Réception: OC, Club: OC }, {}],
  ['extra', 'Armand', 'P', 'extra', 0, { Réception: OC, Club: OC }, {}],
  ['extra', 'Louna', 'Q', 'extra', 0, { Réception: OC, Club: OC }, {}],
]

const SEMAINES_ALTERNANCE = 26

export function hotelReel(): { referentiel: Referentiel; absences: Absence[] } {
  const horaires: Horaire[] = HORAIRES.map(
    ([code, nom, debut, fin, pause, raccourci, rd], i) => ({
      id: i + 1,
      code,
      nom,
      debut,
      fin,
      couleur: '#000000',
      pause,
      raccourci,
      raccourci_debut: rd ?? 0,
      periode: null,
      code_rouge: false,
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
  const postes: Poste[] = POSTES.map(([nom, categorie, codes, aPart], i) => ({
    id: i + 1,
    nom,
    categorie,
    couleur: '#000000',
    horaires_autorises: codes.map(idH),
    a_part: aPart,
    presence: false,
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
      const semaine: JourType[] = TOUS.map(() => ({
        mode: 'auto',
        type_shift_id: null,
        type_absence_id: null,
      }))
      for (const j of opt.travail ?? []) semaine[j].mode = 'travail'
      for (const j of opt.repos ?? []) semaine[j].mode = 'repos'
      for (const j of opt.etoile ?? []) semaine[j].etoile = true
      for (const [j, code] of Object.entries(opt.impose ?? {})) {
        semaine[Number(j)] = {
          ...semaine[Number(j)],
          mode: 'travail',
          type_shift_id: idH(code),
        }
      }
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
          niveau,
        })),
        semaine_type: semaine,
        shifts_autorises: (opt.horaires ?? []).map(idH),
        date_entree: null,
        date_sortie: null,
        actif: true,
        suite_de: null,
      })
      if (opt.alternanceDepuis) {
        const [premier, ecole, hotel] = opt.alternanceDepuis
        for (let k = 0; k < SEMAINES_ALTERNANCE; k++) {
          if (k % (ecole + hotel) < ecole) {
            for (let j = 0; j < 5; j++) {
              absences.push({
                id: ++na,
                salarie_id: id,
                jour: ajouterJours(premier, 7 * k + j),
                motif_id: idM('EC'),
              })
            }
          }
        }
      }
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
      consignes: [],
      verrous: [],
    },
    absences,
  }
}

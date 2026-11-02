import { describe, expect, it } from 'vitest'

import { codesImposes, rubriqueEtoile } from '#/lib/planning/eligibilite.ts'
import {
  contratEtoile,
  estJourneeEtoile,
  estVersionEtoile,
  horairesNormaux,
  travailHoraire,
  versionsEtoile,
} from '#/lib/planning/etoile.ts'
import { horaireDe } from '#/lib/planning/temps.ts'
import type {
  Horaire,
  JourType,
  Periode,
  Poste,
  Salarie,
} from '#/lib/planning/types.ts'

/*
 * Journée étoile sur les horaires qui existent (décisions utilisateur du
 * 2026-11-02, D3 à D6). Les horaires ci-dessous sont ceux de l'hôtel (des
 * heures, aucun nom de personne).
 */

let n = 0
function h(
  debut: string,
  fin: string,
  periode: Periode | null,
  pause = 45,
): Horaire {
  return {
    id: ++n,
    nom: `${debut}-${fin}`,
    debut,
    fin,
    couleur: '#000000',
    pause,
    periode,
  }
}

const M_7_1545 = h('07:00', '15:45', 'matin')
const M_7_1445 = h('07:00', '14:45', 'matin')
const M_730_1515 = h('07:30', '15:15', 'matin')
const M_8_1545 = h('08:00', '15:45', 'matin')
const M_8_1645 = h('08:00', '16:45', 'matin')
const C_7_1245 = h('07:00', '12:45', 'matin')
const MI_9_1645 = h('09:00', '16:45', 'middle')
const MI_11_1945 = h('11:00', '19:45', 'middle')
const MI_12_1945 = h('12:00', '19:45', 'middle')
const MI_12_2045 = h('12:00', '20:45', 'middle')
const MI_13_2045 = h('13:00', '20:45', 'middle')
const S_1430_2315 = h('14:30', '23:15', 'soir')
const S_1430_2215 = h('14:30', '22:15', 'soir')
const S_15_2245 = h('15:00', '22:45', 'soir')
const S_1445_2330 = h('14:45', '23:30', 'soir')
const S_1515_0000 = h('15:15', '00:00', 'soir')
const S_1615_0000 = h('16:15', '00:00', 'soir')
const N_23_7 = h('23:00', '07:00', 'nuit', 0)
const N_0_7 = h('00:00', '07:00', 'nuit', 0)
const TOUS = [
  M_7_1545,
  M_7_1445,
  M_730_1515,
  M_8_1545,
  M_8_1645,
  C_7_1245,
  MI_9_1645,
  MI_11_1945,
  MI_12_1945,
  MI_12_2045,
  MI_13_2045,
  S_1430_2315,
  S_1430_2215,
  S_15_2245,
  S_1445_2330,
  S_1515_0000,
  S_1615_0000,
  N_23_7,
  N_0_7,
]
const ids = (xs: ReadonlyArray<{ id: number }>) => xs.map((x) => x.id)

describe('versions étoile (D4)', () => {
  it('le temps de travail : présence moins pause, minuit en début = 24:00', () => {
    expect(travailHoraire(M_7_1545)).toBe(8 * 60)
    expect(travailHoraire(M_7_1445)).toBe(7 * 60)
    expect(travailHoraire(N_0_7)).toBe(7 * 60)
    expect(travailHoraire(S_1615_0000)).toBe(7 * 60)
  })

  it('accepté : les exemples de l’hôtel', () => {
    expect(ids(versionsEtoile(M_7_1545, TOUS))).toEqual(
      ids([M_7_1445, M_730_1515, M_8_1545]),
    )
    expect(ids(versionsEtoile(M_8_1645, TOUS))).toEqual(
      ids([M_8_1545, MI_9_1645]),
    )
    expect(ids(versionsEtoile(S_1430_2315, TOUS))).toEqual(
      ids([S_1430_2215, S_15_2245]),
    )
    expect(ids(versionsEtoile(MI_11_1945, TOUS))).toEqual(ids([MI_12_1945]))
    expect(ids(versionsEtoile(S_1515_0000, TOUS))).toEqual(ids([S_1615_0000]))
    expect(ids(versionsEtoile(MI_12_2045, TOUS))).toEqual(
      ids([MI_12_1945, MI_13_2045]),
    )
  })

  it('accepté : la nuit de 23:00 contient celle de minuit', () => {
    expect(estVersionEtoile(N_0_7, N_23_7)).toBe(true)
    expect(ids(versionsEtoile(N_23_7, TOUS))).toEqual(ids([N_0_7]))
    expect(ids(horairesNormaux(N_0_7, TOUS))).toEqual(ids([N_23_7]))
  })

  it('refusé : la nuit de minuit n’est pas le matin du même jour', () => {
    // Un horaire qui commence à minuit commence à la fin du jour : il n'est
    // contenu dans aucun horaire du matin ni du soir de ce jour.
    const avantMinuit = h('16:00', '00:00', 'nuit', 60)
    expect(estVersionEtoile(N_0_7, avantMinuit)).toBe(false)
    expect(horaireDe(N_0_7)).toEqual({ debut: '24:00', fin: '07:00' })
    expect(horaireDe(N_23_7)).toEqual({ debut: '23:00', fin: '07:00' })
  })

  it('accepté : un autre moment, s’il tient dans l’horaire de 8 h', () => {
    // 09:00–16:45 est un middle, 08:00–16:45 un matin (2026-11-02).
    expect(estVersionEtoile(MI_9_1645, M_8_1645)).toBe(true)
    // Mais pas s'il déborde : 09:00–16:45 finit après 07:00–15:45.
    expect(estVersionEtoile(MI_9_1645, M_7_1545)).toBe(false)
  })

  it('refusé : plus court que 7 h, pas contenu, de 8 h', () => {
    // Un court de 5 h n'est pas une journée étoile.
    expect(estVersionEtoile(C_7_1245, M_7_1545)).toBe(false)
    // 14:45–23:30 dépasse la fin de 14:30–23:15.
    expect(estVersionEtoile(S_1445_2330, S_1430_2315)).toBe(false)
    // Un horaire de 10 h n'a pas de version étoile (journée normale = 8 h).
    expect(versionsEtoile(h('07:00', '17:45', 'matin', 45), TOUS)).toEqual([])
    // Un horaire de 8 h n'est la version étoile de personne.
    expect(estVersionEtoile(M_8_1645, M_7_1545)).toBe(false)
    // Un horaire de 7 h n'a pas de version étoile.
    expect(versionsEtoile(M_7_1445, TOUS)).toEqual([])
    // Ni lui-même.
    expect(estVersionEtoile(M_7_1545, M_7_1545)).toBe(false)
  })

  it('horaires normaux : ceux de 8 h dont il est la version', () => {
    expect(ids(horairesNormaux(M_8_1545, TOUS))).toEqual(
      ids([M_7_1545, M_8_1645]),
    )
    expect(horairesNormaux(M_8_1645, TOUS)).toEqual([])
  })
})

const personne = (champs: Partial<Salarie> = {}): Salarie => ({
  id: 1,
  prenom: 'Alix',
  nom: 'Essai',
  groupe_id: null,
  type_contrat: 'cdi',
  heures_hebdo: 39,
  forfait_jours: false,
  mineur: false,
  competences: [{ poste_id: 1, niveau: 'titulaire' }],
  semaine_type: Array.from({ length: 7 }, () => ({ mode: 'auto' as const })),
  shifts_autorises: [],
  date_entree: null,
  date_sortie: null,
  actif: true,
  suite_de: null,
  ...champs,
})
const poste = (horaires_autorises: number[]): Poste => ({
  id: 1,
  nom: 'Poste',
  categorie: 'reception',
  couleur: '#000000',
  horaires_autorises,
  presence: false,
})

describe('journée étoile d’un contrat (D3, D5)', () => {
  it('plus de 35 h, ni forfait ni extra', () => {
    expect(contratEtoile(personne())).toBe(true)
    expect(contratEtoile(personne({ heures_hebdo: 35 }))).toBe(false)
    expect(contratEtoile(personne({ forfait_jours: true }))).toBe(false)
    expect(contratEtoile(personne({ type_contrat: 'extra' }))).toBe(false)
  })

  it('un shift de moins de 8 h est la journée étoile, pas un de 8 h', () => {
    expect(estJourneeEtoile(personne(), 7 * 60)).toBe(true)
    expect(estJourneeEtoile(personne(), 8 * 60)).toBe(false)
    expect(estJourneeEtoile(personne({ heures_hebdo: 35 }), 7 * 60)).toBe(false)
  })
})

describe('horaire fixé et versions étoile (codesImposes)', () => {
  it('l’horaire fixé ET ses versions étoile, chaque jour où il est fixé', () => {
    const semaine: JourType[] = Array.from({ length: 7 }, (_, j) =>
      j < 5
        ? { mode: 'travail', type_shift_id: M_8_1645.id }
        : { mode: 'repos' },
    )
    semaine[4] = { ...semaine[4], etoile: true }
    const r = codesImposes(semaine, TOUS)
    expect(r.filter(([j]) => j === 0)).toEqual([
      [0, String(M_8_1645.id)],
      [0, String(M_8_1545.id)],
      [0, String(MI_9_1645.id)],
    ])
    expect(r.filter(([j]) => j === 4).map(([, c]) => c)).toEqual([
      String(M_8_1645.id),
      String(M_8_1545.id),
      String(MI_9_1645.id),
    ])
    // Sans les horaires : l'horaire fixé seul, comme avant.
    expect(codesImposes(semaine).filter(([j]) => j === 0)).toEqual([
      [0, String(M_8_1645.id)],
    ])
  })
})

describe('rubrique « Journée étoile » (D6)', () => {
  const entree = (
    champs: Partial<Salarie>,
    horaireId: number | null,
    permis = ids(TOUS),
  ) => ({
    personne: personne(champs),
    poste: poste(permis),
    jour: 1,
    horaires: TOUS,
    horaireId,
  })

  it('un 39 h sur un horaire de 8 h : ses versions étoile permises', () => {
    const r = rubriqueEtoile(entree({}, M_7_1545.id))
    expect(r?.versions.map((v) => v.horaire.id)).toEqual(
      ids([M_7_1445, M_730_1515, M_8_1545]),
    )
    expect(r?.versions.every((v) => v.alerte === null)).toBe(true)
    expect(r?.normales).toEqual([])
    // Le poste ne permet que 08:00–15:45 : la seule proposée.
    const seul = rubriqueEtoile(
      entree({}, M_7_1545.id, [M_7_1545.id, M_8_1545.id]),
    )
    expect(seul?.versions.map((v) => v.horaire.id)).toEqual([M_8_1545.id])
  })

  it('déjà une version étoile : revenir à l’horaire de 8 h', () => {
    const r = rubriqueEtoile(entree({}, N_0_7.id))
    expect(r?.versions).toEqual([])
    expect(r?.normales.map((v) => v.horaire.id)).toEqual([N_23_7.id])
  })

  it('refusé : 35 h, forfait, horaire spécifique, rien à proposer', () => {
    expect(rubriqueEtoile(entree({ heures_hebdo: 35 }, M_7_1545.id))).toBeNull()
    expect(
      rubriqueEtoile(entree({ forfait_jours: true }, M_7_1545.id)),
    ).toBeNull()
    expect(rubriqueEtoile(entree({}, null))).toBeNull()
    // La fiche ne permet que l'horaire de 8 h : aucune version.
    expect(
      rubriqueEtoile(entree({ shifts_autorises: [M_7_1545.id] }, M_7_1545.id)),
    ).toBeNull()
  })
})

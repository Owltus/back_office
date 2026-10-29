import { describe, expect, it } from 'vitest'

import {
  debutRelecture,
  donneesARanger,
} from '#/lib/planning/donneesARanger.ts'
import type { ShiftLu } from '#/lib/planning/donneesARanger.ts'
import type {
  Competence,
  Horaire,
  Poste,
  Referentiel,
  Salarie,
} from '#/lib/planning/types.ts'
import { SEMAINE_TYPE_VIDE } from '#/lib/planning/types.ts'

/*
 * Données à ranger (étape 11). Hôtel écrit à la main, pseudonymes ; valeurs
 * attendues écrites à la main, jamais recalculées par le code testé.
 */

function horaire(
  id: number,
  code: string,
  debut: string,
  fin: string,
  pause = 0,
): Horaire {
  return {
    id,
    code,
    nom: code,
    debut,
    fin,
    couleur: '#000',
    pause,
    raccourci: 0,
    raccourci_debut: 0,
    periode: 'matin',
    code_rouge: false,
  }
}

function poste(id: number, nom: string, autorises: number[] = []): Poste {
  return {
    id,
    nom,
    categorie: 'reception',
    couleur: '#000',
    horaires_autorises: autorises,
    a_part: false,
    presence: true,
  }
}

function salarie(
  id: number,
  competences: Competence[],
  shifts_autorises: number[] = [],
): Salarie {
  return {
    id,
    prenom: `P${id}`,
    nom: `N${id}`,
    groupe_id: null,
    type_contrat: 'cdi',
    heures_hebdo: 35,
    forfait_jours: false,
    mineur: false,
    competences,
    semaine_type: SEMAINE_TYPE_VIDE,
    shifts_autorises,
    date_entree: null,
    date_sortie: null,
    actif: true,
    suite_de: null,
  }
}

// M 07:00-15:00 (pause 30), S 15:00-23:00, X et Y : mêmes heures 09:00-17:00.
const M = horaire(1, 'M', '07:00', '15:00', 30)
const S = horaire(2, 'S', '15:00', '23:00')
const X = horaire(3, 'X', '09:00', '17:00')
const Y = horaire(4, 'Y', '09:00', '17:00')
const D = horaire(5, 'D', '08:00', '18:00', 60)

// Réception : M et S seulement. Bureau : D seulement. Libre : tous.
const RECEPTION = poste(10, 'Réception', [1, 2])
const BUREAU = poste(20, 'Bureau', [5])
const LIBRE = poste(30, 'Libre')

function ref(salaries: Salarie[], verrous: string[] = []): Referentiel {
  return {
    horaires: [M, S, X, Y, D],
    motifs: [],
    postes: [RECEPTION, BUREAU, LIBRE],
    groupes: [],
    salaries,
    besoins: [],
    consignes: [],
    verrous,
  }
}

let suivant = 1
function shift(p: Partial<ShiftLu>): ShiftLu {
  return {
    id: suivant++,
    lundi: '2026-09-07',
    salarie_id: 1,
    poste_id: 10,
    jour: 0,
    horaire_id: null,
    debut: '07:00',
    fin: '15:00',
    pause: 30,
    ...p,
  }
}

const recep = (id: number) =>
  salarie(id, [{ poste_id: 10, niveau: 'titulaire' }])

describe('donneesARanger : shifts sans code', () => {
  it('propose le code unique aux mêmes heures, pause comprise', () => {
    const g = donneesARanger(ref([recep(1)]), [
      shift({ jour: 0 }),
      shift({ jour: 1 }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].sorte).toBe('rattacher')
    expect(g[0].action).toBe('Rattacher au code M')
    expect(g[0].correction).toEqual({
      type: 'code',
      horaireId: 1,
      debut: '07:00',
      fin: '15:00',
      pause: 30,
    })
    expect(g[0].shifts.map((s) => s.jour)).toEqual([0, 1])
    expect(g[0].texte).toBe(
      "Poste Réception : 2 shifts sans code ont exactement les heures de l'horaire M (07:00 - 15:00).",
    )
  })

  it('une pause différente, ou des heures sans code, ne sont rien', () => {
    expect(
      donneesARanger(ref([recep(1)]), [
        shift({ pause: 0 }),
        shift({ debut: '06:00' }),
      ]),
    ).toEqual([])
  })

  it('ne propose qu’un code permis par le poste', () => {
    // Heures de D, mais la Réception ne permet pas D.
    expect(
      donneesARanger(ref([recep(1)]), [
        shift({ debut: '08:00', fin: '18:00', pause: 60 }),
      ]),
    ).toEqual([])
  })

  it('ne propose qu’un code permis par la fiche', () => {
    const s = salarie(1, [{ poste_id: 10, niveau: 'titulaire' }], [2])
    expect(donneesARanger(ref([s]), [shift({})])).toEqual([])
  })

  it('plusieurs codes aux mêmes heures : signalé, sans proposition', () => {
    const s = salarie(1, [{ poste_id: 30, niveau: 'titulaire' }])
    const g = donneesARanger(ref([s]), [
      shift({ poste_id: 30, debut: '09:00', fin: '17:00', pause: 0 }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].sorte).toBe('heures-communes')
    expect(g[0].correction).toBeNull()
    expect(g[0].action).toBeNull()
    expect(g[0].candidats?.map((h) => h.code)).toEqual(['X', 'Y'])
    expect(g[0].texte).toContain('(X, Y)')
  })
})

describe('donneesARanger : code que le poste ne permet pas', () => {
  it('propose l’autre poste tenu qui le permet', () => {
    const s = salarie(1, [
      { poste_id: 10, niveau: 'titulaire' },
      { poste_id: 20, niveau: 'occasionnel' },
    ])
    const g = donneesARanger(ref([s]), [
      shift({ horaire_id: 5, debut: '08:00', fin: '18:00', pause: 60 }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].sorte).toBe('hors-poste')
    expect(g[0].action).toBe('Passer sur le poste Bureau')
    expect(g[0].correction).toEqual({
      type: 'poste',
      posteId: 20,
      ancienPosteId: 10,
      horaireId: 5,
    })
  })

  it('sans autre poste qui le permet : signalé seulement', () => {
    const g = donneesARanger(ref([recep(1)]), [
      shift({ horaire_id: 5, debut: '08:00', fin: '18:00', pause: 60 }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].correction).toBeNull()
    expect(g[0].lien).toEqual({ page: '/planning/postes', cible: 'poste-10' })
  })

  it('deux postes possibles : celui où la personne est titulaire', () => {
    const s = salarie(1, [
      { poste_id: 10, niveau: 'occasionnel' },
      { poste_id: 20, niveau: 'titulaire' },
      { poste_id: 30, niveau: 'occasionnel' },
    ])
    const g = donneesARanger(ref([s]), [
      shift({ horaire_id: 5, debut: '08:00', fin: '18:00', pause: 60 }),
    ])
    expect(g[0].posteCible?.id).toBe(20)
  })

  it('un poste tenu en soutien n’est jamais proposé', () => {
    const seul = salarie(1, [
      { poste_id: 10, niveau: 'titulaire' },
      { poste_id: 20, niveau: 'soutien' },
    ])
    const d = { horaire_id: 5, debut: '08:00', fin: '18:00', pause: 60 }
    expect(donneesARanger(ref([seul]), [shift(d)])[0].correction).toBeNull()
    // Soutien à côté d'un occasionnel : l'occasionnel seul est retenu.
    const deux = salarie(1, [
      { poste_id: 10, niveau: 'titulaire' },
      { poste_id: 20, niveau: 'occasionnel' },
      { poste_id: 30, niveau: 'soutien' },
    ])
    expect(donneesARanger(ref([deux]), [shift(d)])[0].posteCible?.id).toBe(20)
  })

  it('deux postes possibles au même niveau : aucune proposition', () => {
    const s = salarie(1, [
      { poste_id: 10, niveau: 'titulaire' },
      { poste_id: 20, niveau: 'occasionnel' },
      { poste_id: 30, niveau: 'occasionnel' },
    ])
    const g = donneesARanger(ref([s]), [
      shift({ horaire_id: 5, debut: '08:00', fin: '18:00', pause: 60 }),
    ])
    expect(g[0].correction).toBeNull()
  })

  it('une ligne par proposition : deux personnes, deux lignes', () => {
    const avec = salarie(1, [
      { poste_id: 10, niveau: 'titulaire' },
      { poste_id: 20, niveau: 'occasionnel' },
    ])
    const sans = recep(2)
    const d = { horaire_id: 5, debut: '08:00', fin: '18:00', pause: 60 }
    const g = donneesARanger(ref([avec, sans]), [
      shift({ ...d, salarie_id: 1 }),
      shift({ ...d, salarie_id: 2 }),
      shift({ ...d, salarie_id: 2, jour: 3 }),
    ])
    expect(g.map((x) => [x.action, x.shifts.length])).toEqual([
      ['Passer sur le poste Bureau', 1],
      [null, 2],
    ])
  })

  it('un code permis par le poste n’est rien', () => {
    expect(
      donneesARanger(ref([recep(1)]), [
        shift({ horaire_id: 2, debut: '15:00', fin: '23:00', pause: 0 }),
      ]),
    ).toEqual([])
  })
})

describe('donneesARanger : semaine verrouillée', () => {
  it('ses shifts sont mis à part, et le texte le dit', () => {
    const g = donneesARanger(ref([recep(1)], ['2026-09-07']), [
      shift({ lundi: '2026-09-07', jour: 0 }),
      shift({ lundi: '2026-09-07', jour: 1 }),
      shift({ lundi: '2026-09-14', jour: 0 }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].shifts.map((s) => s.lundi)).toEqual(['2026-09-14'])
    expect(g[0].verrouilles).toHaveLength(2)
    expect(g[0].texte).toContain(
      '2 shifts sont dans une semaine verrouillée, ils ne seront pas modifiés.',
    )
  })

  it('tout verrouillé : signalé, sans correction', () => {
    const g = donneesARanger(ref([recep(1)], ['2026-09-07']), [
      shift({ lundi: '2026-09-07' }),
      shift({ lundi: '2026-09-07', jour: 1 }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].shifts).toEqual([])
    expect(g[0].verrouilles).toHaveLength(2)
    expect(g[0].action).toBeNull()
    expect(g[0].correction).toBeNull()
    expect(g[0].texte).toContain(
      'Ils sont tous dans une semaine verrouillée : rien ne sera modifié. Déverrouillez la semaine pour les corriger.',
    )
  })
})

describe('debutRelecture', () => {
  it('26 semaines avant le lundi de la semaine du jour', () => {
    expect(debutRelecture('2026-10-29')).toBe('2026-04-27')
    expect(debutRelecture('2026-10-26')).toBe('2026-04-27')
  })
})

/*
 * Étape 12 : textes entiers, singulier et pluriel, liens, ordre des shifts
 * et des groupes (survivants du test de mutation). Écrits à la main.
 */
describe('donneesARanger : textes et ordre (test de mutation)', () => {
  const lundi2 = '2026-09-14'

  it('rattacher : un shift, texte au singulier et lien vers le code', () => {
    const [g] = donneesARanger(ref([recep(1)]), [shift({ jour: 0 })])
    expect(g.id).toBe('rattacher:10:1')
    expect(g.texte).toBe(
      "Poste Réception : 1 shift sans code a exactement les heures de l'horaire M (07:00 - 15:00).",
    )
    expect(g.lien).toEqual({ page: '/planning/horaires', cible: 'horaire-1' })
  })

  it('heures communes : texte, identifiant et lien', () => {
    const [g] = donneesARanger(
      ref([salarie(1, [{ poste_id: 30, niveau: 'titulaire' }])]),
      [
        shift({ poste_id: 30, debut: '09:00', fin: '17:00', pause: 0 }),
        shift({
          poste_id: 30,
          jour: 1,
          debut: '09:00',
          fin: '17:00',
          pause: 0,
        }),
      ],
    )
    expect(g.id).toBe('heures-communes:30:3-4')
    expect(g.texte).toBe(
      'Poste Libre : 2 shifts sans code ont les heures de plusieurs horaires à la fois (X, Y). Choisissez le code dans le planning.',
    )
    expect(g.lien).toEqual({ page: '/planning/horaires' })
  })

  it('hors poste avec un autre poste : singulier puis pluriel', () => {
    const p = salarie(1, [
      { poste_id: 10, niveau: 'titulaire' },
      { poste_id: 20, niveau: 'titulaire' },
    ])
    const un = donneesARanger(ref([p]), [
      shift({ horaire_id: 5, debut: '08:00', fin: '18:00', pause: 60 }),
    ])[0]
    expect(un.id).toBe('hors-poste:10:5:20')
    expect(un.texte).toBe(
      "Poste Réception : 1 shift est sur l'horaire D, que ce poste ne permet pas. Cette personne tient aussi le poste Bureau, qui le permet.",
    )
    expect(un.lien).toEqual({ page: '/planning/postes', cible: 'poste-10' })
    const deux = donneesARanger(ref([p]), [
      shift({ horaire_id: 5, debut: '08:00', fin: '18:00', pause: 60 }),
      shift({
        jour: 1,
        horaire_id: 5,
        debut: '08:00',
        fin: '18:00',
        pause: 60,
      }),
    ])[0]
    expect(deux.texte).toBe(
      "Poste Réception : 2 shifts sont sur l'horaire D, que ce poste ne permet pas. Ces personnes tiennent aussi le poste Bureau, qui le permet.",
    )
  })

  it('hors poste sans autre poste : identifiant et textes', () => {
    const un = donneesARanger(ref([recep(1)]), [shift({ horaire_id: 5 })])[0]
    expect(un.id).toBe('hors-poste:10:5:aucun')
    expect(un.texte).toBe(
      "Poste Réception : 1 shift est sur l'horaire D, que ce poste ne permet pas, et aucun autre poste de cette personne ne le permet. Autorisez ce code sur le poste, ou changez ces shifts dans le planning.",
    )
    const deux = donneesARanger(ref([recep(1)]), [
      shift({ horaire_id: 5 }),
      shift({ jour: 2, horaire_id: 5 }),
    ])[0]
    expect(deux.texte).toBe(
      "Poste Réception : 2 shifts sont sur l'horaire D, que ce poste ne permet pas, et aucun autre poste de ces personnes ne le permet. Autorisez ce code sur le poste, ou changez ces shifts dans le planning.",
    )
  })

  it('autre poste : ni le même poste, ni un poste supprimé, ni un poste qui refuse le code', () => {
    const p = salarie(1, [
      { poste_id: 10, niveau: 'titulaire' },
      { poste_id: 99, niveau: 'titulaire' },
    ])
    // Le seul autre poste n'existe plus : aucune proposition.
    expect(donneesARanger(ref([p]), [shift({ horaire_id: 5 })])[0].id).toBe(
      'hors-poste:10:5:aucun',
    )
    // Personne inconnue : aucune proposition non plus.
    expect(
      donneesARanger(ref([]), [shift({ salarie_id: 7, horaire_id: 5 })])[0].id,
    ).toBe('hors-poste:10:5:aucun')
  })

  it('shift sur un poste ou un code supprimé : rien', () => {
    expect(
      donneesARanger(ref([recep(1)]), [
        shift({ poste_id: 99, horaire_id: 5 }),
        shift({ horaire_id: 77 }),
      ]),
    ).toEqual([])
  })

  it('code aux mêmes heures : la fin compte aussi', () => {
    expect(donneesARanger(ref([recep(1)]), [shift({ fin: '14:00' })])).toEqual(
      [],
    )
  })

  it('shifts rangés par date puis par jour puis par id', () => {
    const a = shift({ lundi: lundi2, jour: 0 })
    const b = shift({ jour: 3 })
    const c = shift({ jour: 1 })
    const d = shift({ jour: 1 })
    const [g] = donneesARanger(ref([recep(1)]), [a, b, d, c])
    expect(g.shifts.map((x) => x.id)).toEqual([c.id, d.id, b.id, a.id])
  })

  it('groupes : à corriger d’abord, puis le plus de shifts, puis par id', () => {
    const p = salarie(1, [
      { poste_id: 30, niveau: 'titulaire' },
      { poste_id: 10, niveau: 'titulaire' },
    ])
    const g = donneesARanger(ref([p]), [
      // Heures communes (sans correction), trois shifts.
      shift({ poste_id: 30, debut: '09:00', fin: '17:00', pause: 0 }),
      shift({ poste_id: 30, jour: 1, debut: '09:00', fin: '17:00', pause: 0 }),
      shift({ poste_id: 30, jour: 2, debut: '09:00', fin: '17:00', pause: 0 }),
      // Rattacher M sur la Réception, un shift ; S, deux shifts.
      shift({ jour: 3 }),
      shift({ jour: 4, debut: '15:00', fin: '23:00', pause: 0 }),
      shift({ jour: 5, debut: '15:00', fin: '23:00', pause: 0 }),
    ])
    expect(g.map((x) => x.id)).toEqual([
      'rattacher:10:2',
      'rattacher:10:1',
      'heures-communes:30:3-4',
    ])
  })

  it('verrouillés : textes au singulier et au pluriel', () => {
    const verrou = ref([recep(1)], [lundi2])
    const un = donneesARanger(verrou, [
      shift({ jour: 0 }),
      shift({ lundi: lundi2, jour: 0 }),
    ])[0]
    expect(un.texte).toBe(
      "Poste Réception : 2 shifts sans code ont exactement les heures de l'horaire M (07:00 - 15:00). 1 shift est dans une semaine verrouillée, il ne sera pas modifié.",
    )
    const deux = donneesARanger(verrou, [
      shift({ jour: 0 }),
      shift({ lundi: lundi2, jour: 0 }),
      shift({ lundi: lundi2, jour: 1 }),
    ])[0]
    expect(deux.texte).toContain(
      '2 shifts sont dans une semaine verrouillée, ils ne seront pas modifiés.',
    )
    const tous1 = donneesARanger(verrou, [shift({ lundi: lundi2 })])[0]
    expect(tous1.texte).toContain(
      'Il est dans une semaine verrouillée : rien ne sera modifié. Déverrouillez la semaine pour le corriger.',
    )
    const tous2 = donneesARanger(verrou, [
      shift({ lundi: lundi2 }),
      shift({ lundi: lundi2, jour: 1 }),
    ])[0]
    expect(tous2.texte).toContain(
      'Ils sont tous dans une semaine verrouillée : rien ne sera modifié. Déverrouillez la semaine pour les corriger.',
    )
  })
})

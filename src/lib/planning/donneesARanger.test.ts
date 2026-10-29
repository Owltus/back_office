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
  } as Salarie
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

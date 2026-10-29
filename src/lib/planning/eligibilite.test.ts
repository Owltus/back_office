import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { codesDeLaCase, voisinsDe } from '#/components/planning/codesCase.ts'
import {
  codeDeLaFiche,
  codeImposeRespecte,
  codePrevuAuPoste,
  codesDuPoste,
  codesPermis,
  coupureRespectee,
  posteDeReference,
} from '#/lib/planning/eligibilite.ts'
import {
  REPOS_QUOTIDIEN,
  MINEUR_REPOS_QUOTIDIEN,
} from '#/lib/planning/regles.ts'
import { analyser } from '#/lib/planning/semaine.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import type {
  Absence,
  Affectation,
  Horaire,
  JourType,
  Motif,
  Poste,
  Referentiel,
  Salarie,
} from '#/lib/planning/types.ts'

/*
 * La règle unique des codes permis (étape 2 du plan
 * `planning-coherence-2026-10-28`). Oracle de la propriété : `analyser`,
 * c'est-à-dire le vérificateur sur la semaine réelle. Tout code proposé
 * passe sans alerte de code, de jour fermé ni de repos ; tout code refusé en
 * reçoit une.
 */

const LUNDI = '2026-11-02'

function horaire(id: number, debut: string, fin: string): Horaire {
  return {
    id,
    code: `C${id}`,
    nom: `Code ${id}`,
    debut,
    fin,
    couleur: '#888888',
    pause: 0,
    raccourci: 0,
    raccourci_debut: 0,
    periode: null,
    code_rouge: false,
  }
}

function poste(id: number, horaires_autorises: number[] = []): Poste {
  return {
    id,
    nom: `Poste ${id}`,
    categorie: 'autre',
    couleur: '#444444',
    horaires_autorises,
    a_part: false,
    presence: false,
  }
}

const libre: JourType = { mode: 'auto' }

function salarie(champs: Partial<Salarie> = {}): Salarie {
  return {
    id: 1,
    prenom: 'Alix',
    nom: 'Essai',
    groupe_id: null,
    type_contrat: 'cdi',
    heures_hebdo: 35,
    forfait_jours: false,
    mineur: false,
    competences: [{ poste_id: 1, niveau: 'titulaire' }],
    semaine_type: Array.from({ length: 7 }, () => libre),
    shifts_autorises: [],
    date_entree: null,
    date_sortie: null,
    actif: true,
    suite_de: null,
    ...champs,
  }
}

const MOTIFS: Motif[] = [
  {
    id: 1,
    code: 'CP',
    nom: 'Congés',
    couleur: '#00aa00',
    decompte: true,
    nature: 'absence',
  },
  {
    id: 2,
    code: 'EC',
    nom: 'École',
    couleur: '#0000aa',
    decompte: true,
    nature: 'ecole',
  },
]

const MATIN = horaire(1, '07:00', '15:00')
const SOIR = horaire(2, '15:00', '23:00')
const NUIT = horaire(3, '23:00', '07:00')
const JOUR = horaire(4, '09:00', '17:00')
const TOUS = [MATIN, SOIR, NUIT, JOUR]
const ids = (l: Array<{ id: number }>) => l.map((h) => h.id)

describe('prédicats', () => {
  it('poste : vide = tous, sans code accepté', () => {
    expect(codePrevuAuPoste(poste(1), 9)).toBe(true)
    expect(codePrevuAuPoste(poste(1, [1]), 1)).toBe(true)
    expect(codePrevuAuPoste(poste(1, [1]), 2)).toBe(false)
    expect(codePrevuAuPoste(poste(1, [1]), null)).toBe(true)
  })

  it('fiche : vide = tous, sans code refusé quand elle restreint', () => {
    expect(codeDeLaFiche({ shiftsAutorises: new Set() }, null)).toBe(true)
    expect(codeDeLaFiche({ shiftsAutorises: new Set(['1']) }, '1')).toBe(true)
    expect(codeDeLaFiche({ shiftsAutorises: new Set(['1']) }, '2')).toBe(false)
    expect(codeDeLaFiche({ shiftsAutorises: new Set(['1']) }, null)).toBe(false)
  })

  it('code imposé : seulement ce jour-là', () => {
    const s = { shiftImpose: [[2, '1']] as const }
    expect(codeImposeRespecte(s, 2, '1')).toBe(true)
    expect(codeImposeRespecte(s, 2, '2')).toBe(false)
    expect(codeImposeRespecte(s, 3, '2')).toBe(true)
  })

  it('coupure : bornes comprises', () => {
    expect(coupureRespectee(0, null, 660, 900, 660)).toBe(true)
    expect(coupureRespectee(0, null, 659, 900, 660)).toBe(false)
    expect(coupureRespectee(null, 1560, 0, 900, 660)).toBe(true)
    expect(coupureRespectee(null, 1559, 0, 900, 660)).toBe(false)
  })

  it('codes du poste et poste de référence', () => {
    expect(ids(codesDuPoste(poste(1, [2, 3]), TOUS))).toEqual([2, 3])
    expect(ids(codesDuPoste(poste(1), TOUS))).toEqual([1, 2, 3, 4])
    expect(ids(codesDuPoste(undefined, TOUS))).toEqual([1, 2, 3, 4])
    const p = salarie({
      competences: [
        { poste_id: 5, niveau: 'soutien' },
        { poste_id: 6, niveau: 'titulaire' },
      ],
    })
    expect(posteDeReference(p, [{ id: 9 }])).toBe(6)
    expect(posteDeReference(p, [{ id: 9 }], { poste_id: 4 })).toBe(4)
    expect(posteDeReference(salarie({ competences: [] }), [{ id: 9 }])).toBe(9)
  })
})

describe('codesPermis', () => {
  const base = { horaires: TOUS, jour: 2 }

  it('poste ∩ fiche, sans repli quand rien de commun', () => {
    const r = codesPermis({
      ...base,
      personne: salarie({ shifts_autorises: [1, 4] }),
      poste: poste(1, [1, 2]),
    })
    expect(ids(r.codes)).toEqual([1])
    expect(r.raison).toBeNull()
    const vide = codesPermis({
      ...base,
      personne: salarie({ shifts_autorises: [4] }),
      poste: poste(1, [1, 2]),
    })
    expect(vide.codes).toEqual([])
    expect(vide.raison).toBe('aucun-commun')
    expect(vide.texte).toBe('Aucun horaire commun entre sa fiche et ce poste')
  })

  it('le code fixé par la semaine type réduit la liste à lui seul', () => {
    const semaine = salarie().semaine_type.map((e, j) =>
      j === 2 ? { mode: 'auto' as const, type_shift_id: 2 } : e,
    )
    const r = codesPermis({
      ...base,
      personne: salarie({ semaine_type: semaine }),
      poste: poste(1),
    })
    expect(ids(r.codes)).toEqual([2])
    const hors = codesPermis({
      ...base,
      personne: salarie({ semaine_type: semaine }),
      poste: poste(1, [1]),
    })
    expect(hors.raison).toBe('code-fixe-hors-poste')
    // Un autre jour, la liste reste entière.
    expect(
      codesPermis({
        ...base,
        jour: 3,
        personne: salarie({ semaine_type: semaine }),
        poste: poste(1),
      }).codes,
    ).toHaveLength(4)
  })

  it('jours fermés : repos fixe, absence fixe, école, hors contrat', () => {
    const avec = (e: JourType) =>
      salarie().semaine_type.map((x, j) => (j === 2 ? e : x))
    expect(
      codesPermis({
        ...base,
        personne: salarie({ semaine_type: avec({ mode: 'repos' }) }),
        poste: poste(1),
      }).raison,
    ).toBe('repos-fixe')
    expect(
      codesPermis({
        ...base,
        personne: salarie({
          semaine_type: avec({ mode: 'absence', type_absence_id: 1 }),
        }),
        poste: poste(1),
      }).raison,
    ).toBe('absence-fixe')
    expect(
      codesPermis({
        ...base,
        personne: salarie(),
        poste: poste(1),
        journee: { ecole: true },
      }).raison,
    ).toBe('ecole')
    expect(
      codesPermis({
        ...base,
        personne: salarie(),
        poste: poste(1),
        journee: { horsContrat: true },
      }).raison,
    ).toBe('hors-contrat')
  })

  it('coupure de 11 h avec la veille : codes écartés et dits', () => {
    // Veille 15:00-23:00 : demain, 07:00 et 09:00 ne laissent que 8 h et 10 h.
    const r = codesPermis({
      ...base,
      personne: salarie(),
      poste: poste(1),
      lundi: LUNDI,
      voisins: [{ jour: 1, debut: '15:00', fin: '23:00' }],
    })
    expect(ids(r.codes)).toEqual([2, 3])
    expect(r.raison).toBeNull()
    expect(r.ecartes.map((e) => [e.horaire.id, e.cote])).toEqual([
      [1, 'veille'],
      [4, 'veille'],
    ])
    expect(r.ecartes[0].texte).toBe(
      'Coupure de 11 h non respectée avec la veille',
    )
  })

  it('coupure avec le lendemain, et liste vide', () => {
    const r = codesPermis({
      ...base,
      personne: salarie({ shifts_autorises: [2, 3] }),
      poste: poste(1),
      lundi: LUNDI,
      voisins: [{ jour: 3, debut: '07:00', fin: '15:00' }],
    })
    expect(r.codes).toEqual([])
    expect(r.raison).toBe('coupure-11h')
    expect(r.texte).toBe('Coupure de 11 h non respectée avec le lendemain')
  })

  it('mineur : 12 h, chiffre de regles.ts', () => {
    expect(MINEUR_REPOS_QUOTIDIEN).toBeGreaterThan(REPOS_QUOTIDIEN)
    // Veille finie à 19:00 : 07:00 laisse 12 h, 06:30 non.
    const tot = horaire(5, '06:30', '12:00')
    const entree = {
      ...base,
      horaires: [MATIN, tot],
      poste: poste(1),
      lundi: LUNDI,
      voisins: [{ jour: 1, debut: '11:00', fin: '19:00' }],
    }
    expect(ids(codesPermis({ ...entree, personne: salarie() }).codes)).toEqual([
      1, 5,
    ])
    const mineur = codesPermis({
      ...entree,
      personne: salarie({ mineur: true }),
    })
    expect(ids(mineur.codes)).toEqual([1])
    expect(mineur.ecartes[0].texte).toBe(
      'Coupure de 12 h non respectée avec la veille',
    )
  })
})

describe('codesDeLaCase', () => {
  const sem = (affectations: Array<Partial<Affectation>>): SemaineOut =>
    ({
      lundi: LUNDI,
      affectations: affectations.map((a, i) => ({
        id: i + 1,
        salarie_id: 1,
        poste_id: 1,
        jour: 0,
        type_shift_id: null,
        debut: '07:00',
        fin: '15:00',
        ...a,
      })),
      bilan: [],
    }) as unknown as SemaineOut

  it('voisins des semaines voisines, dans le repère de la semaine', () => {
    const v = voisinsDe(
      {
        semaine: sem([{ jour: 3 }, { jour: 2 }]),
        avant: sem([{ jour: 6, debut: '15:00', fin: '23:00' }]),
        apres: sem([{ jour: 0 }]),
      },
      1,
      2,
    )
    expect(v.map((x) => x.jour).sort((a, b) => a - b)).toEqual([-1, 3, 7])
  })

  it('le shift modifié ne compte pas comme voisin', () => {
    expect(voisinsDe({ semaine: sem([{ jour: 3 }]) }, 1, 2, 1)).toEqual([])
  })

  it("le dimanche d'avant compte pour le lundi", () => {
    const r = codesDeLaCase({
      referentiel: { horaires: TOUS, postes: [poste(1)], motifs: MOTIFS },
      personne: salarie(),
      posteId: 1,
      jour: 0,
      source: {
        semaine: sem([]),
        avant: sem([{ jour: 6, debut: '15:00', fin: '23:00' }]),
      },
    })
    expect(ids(r.ecartes.map((e) => e.horaire))).toEqual([1, 4])
  })
})

// ----------------------------------------------------------- propriété

const REGLES_CODE = new Set([
  'HORAIRE-PERSO',
  'HORAIRE-POSTE',
  'REPOS-FIXE',
  'ABSENCE',
  'R-REPOS-QUOTIDIEN',
  'CHEVAUCHEMENT',
])

const heure = fc
  .integer({ min: 0, max: 95 })
  .map(
    (q) =>
      `${String(Math.floor(q / 4)).padStart(2, '0')}:${String((q % 4) * 15).padStart(2, '0')}`,
  )
const unHoraire = (id: number) =>
  fc.tuple(heure, fc.integer({ min: 4, max: 52 })).map(([debut, quarts]) => {
    const [h, m] = debut.split(':').map(Number)
    const fin = (h * 60 + m + quarts * 15) % 1440
    return horaire(
      id,
      debut,
      `${String(Math.floor(fin / 60)).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}`,
    )
  })

const scenario = fc.integer({ min: 2, max: 6 }).chain((n) =>
  fc.record({
    horaires: fc.tuple(
      ...Array.from({ length: n }, (_, i) => unHoraire(i + 1)),
    ),
    duPoste: fc.subarray(Array.from({ length: n }, (_, i) => i + 1)),
    deLaFiche: fc.subarray(Array.from({ length: n }, (_, i) => i + 1)),
    mineur: fc.boolean(),
    jour: fc.integer({ min: 1, max: 5 }),
    // Le jour visé dans la semaine type.
    typeJour: fc.oneof(
      fc.constant<JourType>({ mode: 'auto' }),
      fc.constant<JourType>({ mode: 'repos' }),
      fc.constant<JourType>({ mode: 'absence', type_absence_id: 1 }),
      fc.constant<JourType>({ mode: 'absence', type_absence_id: 2 }),
      fc
        .integer({ min: 1, max: n })
        .map<JourType>((id) => ({ mode: 'auto', type_shift_id: id })),
      fc
        .integer({ min: 1, max: n })
        .map<JourType>((id) => ({ mode: 'travail', type_shift_id: id })),
    ),
    ecoleCalendrier: fc.boolean(),
    veille: fc.option(fc.integer({ min: 1, max: n })),
    lendemain: fc.option(fc.integer({ min: 1, max: n })),
  }),
)

describe('propriété : le menu et le moteur disent la même chose', () => {
  it('code proposé = accepté ; code refusé = signalé', () => {
    fc.assert(
      fc.property(scenario, (sc) => {
        const horaires = [...sc.horaires]
        const leJour = sc.typeJour
        const personne = salarie({
          mineur: sc.mineur,
          shifts_autorises: sc.deLaFiche,
          semaine_type: Array.from({ length: 7 }, (_, j) =>
            j === sc.jour ? leJour : libre,
          ),
        })
        const referentiel: Referentiel = {
          horaires,
          motifs: MOTIFS,
          postes: [poste(1, sc.duPoste)],
          groupes: [],
          salaries: [personne],
          besoins: [],
          consignes: [],
          verrous: [],
        }
        const absences: Absence[] =
          sc.ecoleCalendrier && leJour.mode !== 'absence'
            ? [
                {
                  id: 1,
                  salarie_id: 1,
                  jour: `2026-11-0${2 + sc.jour}`,
                  motif_id: 2,
                },
              ]
            : []
        const affectation = (
          id: number,
          jour: number,
          h: Horaire,
        ): Affectation => ({
          id,
          lundi: LUNDI,
          salarie_id: 1,
          poste_id: 1,
          jour,
          horaire_id: h.id,
          debut: h.debut,
          fin: h.fin,
          epinglee: true,
          court: false,
          pause: 0,
        })
        const voisins: Affectation[] = []
        if (sc.veille !== null)
          voisins.push(affectation(10, sc.jour - 1, horaires[sc.veille - 1]))
        if (sc.lendemain !== null)
          voisins.push(affectation(11, sc.jour + 1, horaires[sc.lendemain - 1]))
        const donnees = (affectations: Affectation[]) => ({
          lundi: LUNDI,
          referentiel,
          absences,
          affectations,
          avant: [],
          apres: [],
        })
        const permis = codesDeLaCase({
          referentiel,
          personne,
          posteId: 1,
          jour: sc.jour,
          source: { semaine: analyser(donnees(voisins)) },
        })
        expect(permis.codes.length === 0).toBe(permis.raison !== null)
        for (const h of horaires) {
          const sem = analyser(
            donnees([...voisins, affectation(99, sc.jour, h)]),
          )
          const alertes = sem.affectations
            .find((a) => a.id === 99)!
            .alertes.filter((a) => REGLES_CODE.has(a.regle))
          const propose = permis.codes.some((x) => x.id === h.id)
          if (propose) expect(alertes).toEqual([])
          else expect(alertes.length).toBeGreaterThan(0)
          // Un code écarté pour la coupure l'est vraiment pour le repos.
          if (permis.ecartes.some((e) => e.horaire.id === h.id)) {
            expect(
              alertes.some(
                (a) =>
                  a.regle === 'R-REPOS-QUOTIDIEN' ||
                  a.regle === 'CHEVAUCHEMENT',
              ),
            ).toBe(true)
          }
        }
      }),
      { numRuns: 300 },
    )
  })
})

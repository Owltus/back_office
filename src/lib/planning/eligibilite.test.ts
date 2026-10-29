import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  actuelNonPermis,
  codesDeLaCase,
  voisinsDe,
} from '#/components/planning/codesCase.ts'
import {
  codeDeLaFiche,
  codeImposeRespecte,
  codePrevuAuPoste,
  codesDuPoste,
  codesImposes,
  codesPermis,
  coupureRespectee,
  posteDeReference,
  TEXTE_RAISON,
} from '#/lib/planning/eligibilite.ts'
import type { Voisin } from '#/lib/planning/eligibilite.ts'
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
        avant: sem([{ jour: 6, debut: '15:00', fin: '23:00' }]).affectations,
        apres: sem([{ jour: 0 }]).affectations,
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
        avant: sem([{ jour: 6, debut: '15:00', fin: '23:00' }]).affectations,
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

// ------------------------------------------------ correctifs (relecture)

describe('bords de semaine et changement d’heure', () => {
  const entree = (jour: number, voisins: Voisin[], lundi = LUNDI) => ({
    horaires: TOUS,
    personne: salarie(),
    poste: poste(1),
    jour,
    lundi,
    voisins,
  })

  it('lundi : le dimanche d’avant (jour -1) compte', () => {
    const r = codesPermis(
      entree(0, [{ jour: -1, debut: '15:00', fin: '23:00' }]),
    )
    expect(ids(r.ecartes.map((e) => e.horaire))).toEqual([1, 4])
    expect(r.ecartes.every((e) => e.cote === 'veille')).toBe(true)
  })

  it('dimanche : le lundi d’après (jour 7) compte', () => {
    // Lundi d'après à 07:00 : dimanche, le soir (fin 23:00) et la nuit
    // (fin 07:00) ne laissent pas 11 h.
    const r = codesPermis(
      entree(6, [{ jour: 7, debut: '07:00', fin: '15:00' }]),
    )
    expect(ids(r.codes)).toEqual([1, 4])
    expect(ids(r.ecartes.map((e) => e.horaire))).toEqual([2, 3])
    expect(r.ecartes.every((e) => e.cote === 'lendemain')).toBe(true)
  })

  it('codesDeLaCase lit les shifts des semaines voisines (avant et après)', () => {
    const ref = { horaires: TOUS, postes: [poste(1)], motifs: MOTIFS }
    const vide = {
      lundi: LUNDI,
      affectations: [],
      bilan: [],
    } as unknown as SemaineOut
    const lundiApres = (salarie_id: number) => [
      { id: 50, salarie_id, jour: 0, debut: '07:00', fin: '15:00' },
    ]
    const dimanche = codesDeLaCase({
      referentiel: ref,
      personne: salarie(),
      posteId: 1,
      jour: 6,
      source: { semaine: vide, apres: lundiApres(1) },
    })
    expect(ids(dimanche.ecartes.map((e) => e.horaire))).toEqual([2, 3])
    // Le shift d'une autre personne ne compte pas.
    const autre = codesDeLaCase({
      referentiel: ref,
      personne: salarie(),
      posteId: 1,
      jour: 6,
      source: { semaine: vide, apres: lundiApres(2) },
    })
    expect(autre.ecartes).toEqual([])
    // Dimanche d'avant, pour le lundi.
    const lundi = codesDeLaCase({
      referentiel: ref,
      personne: salarie(),
      posteId: 1,
      jour: 0,
      source: {
        semaine: vide,
        avant: [
          { id: 51, salarie_id: 1, jour: 6, debut: '15:00', fin: '23:00' },
        ],
      },
    })
    expect(ids(lundi.ecartes.map((e) => e.horaire))).toEqual([1, 4])
  })

  it('fin octobre : l’heure rendue compte dans la coupure (minutes réelles)', () => {
    // Semaine du 19/10/2026, on recule d'une heure dans la nuit du samedi
    // 24 au dimanche 25. Samedi 15:00-23:00 puis dimanche 09:00 : 10 h à
    // l'horloge, 11 h réelles, donc permis. Une semaine ordinaire le refuse.
    const veille = [{ jour: 5, debut: '15:00', fin: '23:00' }]
    expect(ids(codesPermis(entree(6, veille, '2026-10-19')).codes)).toContain(4)
    expect(ids(codesPermis(entree(6, veille, LUNDI)).codes)).not.toContain(4)
  })

  it('fin mars : l’heure perdue compte dans la coupure', () => {
    // Semaine du 22/03/2027, on avance d'une heure dans la nuit du samedi 27
    // au dimanche 28. Samedi 14:00-22:00 puis dimanche 09:00 : 11 h à
    // l'horloge, 10 h réelles, donc refusé. Une semaine ordinaire l'accepte.
    const horaires = [...TOUS, horaire(5, '14:00', '22:00')]
    const veille = [{ jour: 5, debut: '14:00', fin: '22:00' }]
    const r = (lundi: string) =>
      codesPermis({ ...entree(6, veille, lundi), horaires })
    expect(ids(r('2027-03-22').codes)).not.toContain(4)
    expect(r('2027-03-22').ecartes.some((e) => e.horaire.id === 4)).toBe(true)
    expect(ids(r(LUNDI).codes)).toContain(4)
  })

  it('le moteur dit la même chose au changement d’heure', () => {
    // Oracle : `analyser` sur la semaine du 22/03/2027.
    const lundi = '2027-03-22'
    const horaires = [...TOUS, horaire(5, '14:00', '22:00')]
    const personne = salarie()
    const referentiel: Referentiel = {
      horaires,
      motifs: MOTIFS,
      postes: [poste(1)],
      groupes: [],
      salaries: [personne],
      besoins: [],
      consignes: [],
      verrous: [],
    }
    const aff = (id: number, jour: number, h: Horaire): Affectation => ({
      id,
      lundi,
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
    const alertesRepos = (h: Horaire) =>
      analyser({
        lundi,
        referentiel,
        absences: [],
        affectations: [aff(1, 5, horaires[4]), aff(2, 6, h)],
        avant: [],
        apres: [],
      })
        .affectations.find((a) => a.id === 2)!
        .alertes.filter((a) => a.regle === 'R-REPOS-QUOTIDIEN')
    const permis = codesPermis({
      horaires,
      personne,
      poste: poste(1),
      jour: 6,
      lundi,
      voisins: [{ jour: 5, debut: '14:00', fin: '22:00' }],
    })
    for (const h of horaires) {
      const propose = permis.codes.some((x) => x.id === h.id)
      expect(alertesRepos(h).length === 0).toBe(propose)
    }
  })
})

describe('jour fermé : absence fixe avant école', () => {
  const avecEcoleFixe = salarie({
    semaine_type: Array.from({ length: 7 }, (_, j) =>
      j === 2 ? { mode: 'absence', type_absence_id: 2 } : libre,
    ),
  })

  it('une école fixée par la semaine type se change dans la fiche', () => {
    const r = codesPermis({
      horaires: TOUS,
      jour: 2,
      personne: avecEcoleFixe,
      poste: poste(1),
      // Le bilan la voit aussi comme un jour d'école.
      journee: { ecole: true },
    })
    expect(r.raison).toBe('absence-fixe')
    expect(r.texte).toMatch(/fiche/)
  })

  it('une école du calendrier se retire depuis la grille', () => {
    const r = codesPermis({
      horaires: TOUS,
      jour: 2,
      personne: salarie(),
      poste: poste(1),
      journee: { ecole: true },
    })
    expect(r.raison).toBe('ecole')
    expect(r.texte).toBe("Jour d'école : retirez d'abord l'école de ce jour")
  })
})

describe('code actuel qui n’est plus permis', () => {
  it('rendu avec sa raison, jamais quand il est permis', () => {
    const fermes = codesPermis({
      horaires: TOUS,
      jour: 2,
      personne: salarie({
        semaine_type: Array.from({ length: 7 }, (_, j) =>
          j === 2 ? { mode: 'repos' } : libre,
        ),
      }),
      poste: poste(1),
    })
    expect(actuelNonPermis(fermes, TOUS, 1)).toEqual({
      horaire: MATIN,
      texte: 'Repos fixé par sa semaine type',
    })
    const ouverts = codesPermis({
      horaires: TOUS,
      jour: 2,
      personne: salarie(),
      poste: poste(1, [2]),
    })
    expect(actuelNonPermis(ouverts, TOUS, 2)).toBeNull()
    expect(actuelNonPermis(ouverts, TOUS, 1)?.texte).toBe(
      "N'est plus permis ici",
    )
    expect(actuelNonPermis(ouverts, TOUS, null)).toBeNull()
    // Écarté pour la coupure : la raison de la coupure.
    const coupure = codesPermis({
      horaires: TOUS,
      jour: 2,
      personne: salarie(),
      poste: poste(1),
      lundi: LUNDI,
      voisins: [{ jour: 1, debut: '15:00', fin: '23:00' }],
    })
    expect(actuelNonPermis(coupure, TOUS, 1)?.texte).toBe(
      'Coupure de 11 h non respectée avec la veille',
    )
  })
})

describe('oracle écrit à la main : poste ∩ fiche ∩ code imposé', () => {
  it('codesPermis rend exactement les codes attendus, et la bonne raison', () => {
    const tousIds = [1, 2, 3, 4]
    fc.assert(
      fc.property(
        fc.subarray(tousIds),
        fc.subarray(tousIds),
        fc.option(fc.constantFrom(...tousIds)),
        fc.constantFrom<'auto' | 'travail'>('auto', 'travail'),
        fc.integer({ min: 0, max: 6 }),
        (duPoste, deLaFiche, impose, mode, jour) => {
          // Oracle : la règle dite en français, sur des tableaux, sans les
          // prédicats de `eligibilite.ts`.
          const dansPoste = (id: number) =>
            duPoste.length === 0 || duPoste.indexOf(id) >= 0
          const dansFiche = (id: number) =>
            deLaFiche.length === 0 || deLaFiche.indexOf(id) >= 0
          const communs = tousIds.filter((id) => dansPoste(id) && dansFiche(id))
          const attendus = communs.filter(
            (id) => impose === null || id === impose,
          )
          const raison =
            attendus.length > 0
              ? null
              : communs.length === 0
                ? 'aucun-commun'
                : 'code-fixe-hors-poste'

          const semaine_type: JourType[] = Array.from({ length: 7 }, (_, j) =>
            j === jour && impose !== null
              ? { mode, type_shift_id: impose }
              : libre,
          )
          const personne = salarie({
            shifts_autorises: deLaFiche,
            semaine_type,
          })
          const r = codesPermis({
            horaires: TOUS,
            jour,
            personne,
            poste: poste(1, duPoste),
          })
          expect(ids(r.codes)).toEqual(attendus)
          expect(r.raison).toBe(raison)
          // Un code imposé un AUTRE jour ne change rien à celui-ci.
          const ailleurs = codesPermis({
            horaires: TOUS,
            jour: (jour + 1) % 7,
            personne,
            poste: poste(1, duPoste),
          })
          expect(ids(ailleurs.codes)).toEqual(communs)
        },
      ),
      { numRuns: 500 },
    )
  })
})

describe('bords tués par le test de mutation (étape 12)', () => {
  const base = { horaires: TOUS, jour: 2 }

  it('codes imposés : seulement Libre ou Travaille avec un horaire', () => {
    const semaine: JourType[] = [
      { mode: 'auto', type_shift_id: 1 },
      { mode: 'travail', type_shift_id: 2 },
      { mode: 'repos', type_shift_id: 3 },
      { mode: 'absence', type_shift_id: 4 },
      { mode: 'auto' },
      { mode: 'travail', type_shift_id: null },
      libre,
    ]
    expect(codesImposes(semaine)).toEqual([
      [0, '1'],
      [1, '2'],
    ])
  })

  it('poste de référence : rien à proposer sans compétence ni poste', () => {
    expect(posteDeReference({ competences: [] }, [])).toBeUndefined()
  })

  it('semaine type plus courte que le jour visé : jour libre', () => {
    const r = codesPermis({
      ...base,
      personne: salarie({ semaine_type: [] }),
      poste: poste(1),
    })
    expect(ids(r.codes)).toEqual(ids(TOUS))
    expect(r.raison).toBeNull()
  })

  it('avec le lundi mais sans voisin : rien d’écarté', () => {
    const r = codesPermis({
      ...base,
      personne: salarie(),
      poste: poste(1),
      lundi: LUNDI,
    })
    expect(ids(r.codes)).toEqual(ids(TOUS))
    expect(r.ecartes).toEqual([])
  })

  it('un shift posé le même jour n’est pas un voisin', () => {
    // C'est le shift de la case elle-même (ou son remplacement) : la
    // coupure ne se mesure qu'avec la veille et le lendemain.
    const r = codesPermis({
      ...base,
      personne: salarie(),
      poste: poste(1),
      lundi: LUNDI,
      voisins: [{ jour: 2, debut: '07:00', fin: '15:00' }],
    })
    expect(ids(r.codes)).toEqual(ids(TOUS))
    expect(r.ecartes).toEqual([])
  })

  it('un code écarté porte la raison coupure-11h', () => {
    const r = codesPermis({
      ...base,
      personne: salarie(),
      poste: poste(1),
      lundi: LUNDI,
      voisins: [{ jour: 1, debut: '15:00', fin: '23:00' }],
    })
    expect(r.ecartes.length).toBeGreaterThan(0)
    for (const e of r.ecartes) expect(e.raison).toBe('coupure-11h')
  })

  it('chaque raison a une phrase à afficher', () => {
    for (const [raison, texte] of Object.entries(TEXTE_RAISON)) {
      expect(texte.length, raison).toBeGreaterThan(10)
      expect(texte).not.toMatch(/[«»—]/)
    }
    expect(TEXTE_RAISON['hors-contrat']).toBe('En dehors de son contrat')
    expect(TEXTE_RAISON['code-fixe-hors-poste']).toMatch(/semaine type/)
    expect(TEXTE_RAISON['coupure-11h']).toMatch(/repos/)
  })
})

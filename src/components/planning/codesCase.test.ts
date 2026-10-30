import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  codesDeLaCase,
  codesUniques,
  ligneDe,
  posteDeduit,
  rubriquesDeLaCase,
} from '#/components/planning/codesCase.ts'
import type { SourceCase } from '#/components/planning/codesCase.ts'
import { analyser } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import type { Competence, Niveau, Salarie } from '#/lib/planning/types.ts'

/*
 * Rubriques du mode manuel (décision utilisateur du 2026-10-30) : tous les
 * codes de la personne, une rubrique par poste de sa FICHE, titulaire puis
 * dépannage puis soutien ; chaque rubrique = la règle unique pour ce poste ;
 * la coupure de repos quotidien choisissable avec son alerte, les autres
 * raisons bloquantes. Hôtel fictif de démonstration.
 */

const LUNDI = '2026-11-02'
const { referentiel, absences } = hotelDemo(LUNDI)
const idP = (nom: string) => referentiel.postes.find((p) => p.nom === nom)!.id
const idH = (code: string) =>
  referentiel.horaires.find((h) => h.code === code)!.id
const BASE = referentiel.salaries.find((s) => s.id === 3)!

const personne = (champs: Partial<Salarie> = {}): Salarie => ({
  ...BASE,
  ...champs,
})
const fiche = (...c: Array<[string, Niveau]>): Competence[] =>
  c.map(([nom, niveau]) => ({ poste_id: idP(nom), niveau }))
const vide: SourceCase = { semaine: null }
const nomsDe = (r: ReturnType<typeof rubriquesDeLaCase>) =>
  r.rubriques.map((x) => x.poste.nom)

/** Semaine où la personne 3 fait l'après-midi le mardi (fin 23:45). */
const apresMidiMardi: SourceCase = {
  semaine: analyser({
    lundi: LUNDI,
    referentiel,
    absences,
    affectations: [
      {
        id: 50,
        lundi: LUNDI,
        salarie_id: 3,
        poste_id: idP('Réception'),
        jour: 1,
        horaire_id: idH('AM'),
        debut: '15:00',
        fin: '23:45',
        epinglee: true,
        court: false,
        pause: 45,
      },
    ],
    avant: [],
    apres: [],
  }),
}

describe('rubriquesDeLaCase', () => {
  it('ordre : titulaire, puis dépannage, puis soutien, quel que soit l’ordre des postes', () => {
    const r = rubriquesDeLaCase({
      referentiel,
      personne: personne({
        competences: fiche(
          ['Club', 'soutien'],
          ['Veille de nuit', 'occasionnel'],
          ['Réception', 'titulaire'],
        ),
        shifts_autorises: [],
      }),
      jour: 2,
      source: vide,
    })
    expect(nomsDe(r)).toEqual(['Réception', 'Veille de nuit', 'Club'])
    expect(r.rubriques.map((x) => x.niveau)).toEqual([
      'titulaire',
      'occasionnel',
      'soutien',
    ])
  })

  it('même niveau : l’ordre des postes', () => {
    const r = rubriquesDeLaCase({
      referentiel,
      personne: personne({
        competences: fiche(['Club', 'titulaire'], ['Réception', 'titulaire']),
      }),
      jour: 2,
      source: vide,
    })
    expect(nomsDe(r)).toEqual(['Réception', 'Club'])
  })

  it('jamais un poste absent de sa fiche ; celui du shift reste montré en dernier', () => {
    const p = personne({ competences: fiche(['Réception', 'titulaire']) })
    expect(
      nomsDe(
        rubriquesDeLaCase({ referentiel, personne: p, jour: 2, source: vide }),
      ),
    ).toEqual(['Réception'])
    const avecShift = rubriquesDeLaCase({
      referentiel,
      personne: p,
      jour: 2,
      source: vide,
      shift: { poste_id: idP('Club'), type_shift_id: idH('M') },
    })
    expect(nomsDe(avecShift)).toEqual(['Réception', 'Club'])
    expect(avecShift.rubriques[1].niveau).toBeNull()
  })

  it('chaque rubrique = la règle unique pour son poste (codes et coupure)', () => {
    fc.assert(
      fc.property(
        fc.subarray(['Réception', 'Club', 'Veille de nuit', 'Direction']),
        fc.subarray(['M', 'MI', 'AM', 'N', 'D']),
        fc.integer({ min: 0, max: 6 }),
        (postes, codes, jour) => {
          const p = personne({
            competences: fiche(
              ...postes.map((n): [string, Niveau] => [n, 'titulaire']),
            ),
            shifts_autorises: codes.map(idH),
          })
          const r = rubriquesDeLaCase({
            referentiel,
            personne: p,
            jour,
            source: apresMidiMardi,
          })
          for (const rub of r.rubriques) {
            const regle = codesDeLaCase({
              referentiel,
              personne: p,
              posteId: rub.poste.id,
              jour,
              source: apresMidiMardi,
            })
            const attendus = [
              ...regle.codes.map((h) => h.id),
              ...regle.ecartes.map((e) => e.horaire.id),
            ].sort((a, b) => a - b)
            expect(
              rub.lignes.map((l) => l.horaire.id).sort((a, b) => a - b),
            ).toEqual(attendus)
            expect(postes).toContain(rub.poste.nom)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('coupure de 11 h : choisissable, avec son alerte sur la ligne', () => {
    const r = rubriquesDeLaCase({
      referentiel,
      personne: BASE,
      jour: 2,
      source: apresMidiMardi,
    })
    const matin = ligneDe(r, idP('Réception'), idH('M'))
    expect(matin?.ligne.alerte).toBe('-11 h de repos')
    expect(ligneDe(r, idP('Réception'), idH('AM'))?.ligne.alerte).toBeNull()
    expect(ligneDe(r, idP('Club'), idH('M'))?.ligne.alerte).toMatch(/11 h/)
  })

  it('coupure de 12 h pour un mineur', () => {
    const r = rubriquesDeLaCase({
      referentiel,
      personne: personne({ mineur: true }),
      jour: 2,
      source: apresMidiMardi,
    })
    expect(ligneDe(r, idP('Réception'), idH('M'))?.ligne.alerte).toBe(
      '-12 h de repos',
    )
  })

  it('les autres raisons restent bloquantes : repos fixé, aucune rubrique', () => {
    const r = rubriquesDeLaCase({
      referentiel,
      personne: personne({
        semaine_type: BASE.semaine_type.map((j, i) =>
          i === 2 ? { mode: 'repos' as const } : j,
        ),
      }),
      jour: 2,
      source: vide,
    })
    expect(r.rubriques).toEqual([])
    expect(r.texte).toBe('Repos fixé par sa semaine type')
  })

  it('rubrique vide : non affichée ; toutes vides : la raison', () => {
    // Fiche réduite à la nuit : seule la veille de nuit a des codes.
    const p = personne({
      competences: fiche(
        ['Réception', 'titulaire'],
        ['Veille de nuit', 'occasionnel'],
      ),
      shifts_autorises: [idH('N')],
    })
    const r = rubriquesDeLaCase({
      referentiel,
      personne: p,
      jour: 2,
      source: vide,
    })
    expect(nomsDe(r)).toEqual(['Veille de nuit'])
    expect(r.texte).toBeNull()
    const aucun = rubriquesDeLaCase({
      referentiel,
      personne: { ...p, competences: fiche(['Réception', 'titulaire']) },
      jour: 2,
      source: vide,
    })
    expect(aucun.texte).toBe(
      'Aucun horaire commun entre sa fiche et ses postes',
    )
    expect(
      rubriquesDeLaCase({
        referentiel,
        personne: personne({ competences: [] }),
        jour: 2,
        source: vide,
      }).texte,
    ).toBe('Aucun poste dans sa fiche')
  })

  it('code actuel qui n’est plus permis : à part, ou gardé avec sa raison (éditeur)', () => {
    const p = personne({ shifts_autorises: [idH('AM')] })
    const shift = { poste_id: idP('Réception'), type_shift_id: idH('M') }
    const menu = rubriquesDeLaCase({
      referentiel,
      personne: p,
      jour: 2,
      source: vide,
      shift,
    })
    expect(menu.actuel?.horaire.code).toBe('M')
    expect(ligneDe(menu, idP('Réception'), idH('M'))).toBeNull()
    const editeur = rubriquesDeLaCase({
      referentiel,
      personne: p,
      jour: 2,
      source: vide,
      shift,
      garderActuel: true,
    })
    expect(editeur.actuel).toBeNull()
    expect(ligneDe(editeur, idP('Réception'), idH('M'))?.ligne.alerte).toBe(
      "N'est plus permis ici",
    )
  })
})

describe('codesUniques : chaque code une fois, poste déduit', () => {
  const rubriquesDe = (
    p: Salarie,
    shift?: { poste_id: number; type_shift_id: number | null },
  ) =>
    rubriquesDeLaCase({
      referentiel,
      personne: p,
      jour: 2,
      source: vide,
      shift,
    })

  it('propriété : aucun code en double, et c’est l’union des postes', () => {
    fc.assert(
      fc.property(
        fc.subarray(['Réception', 'Club', 'Veille de nuit', 'Direction']),
        fc.subarray(['M', 'MI', 'AM', 'N', 'D']),
        fc.integer({ min: 0, max: 6 }),
        fc.constantFrom(undefined, 1, 2, 3, 4),
        (postes, codes, jour, prefere) => {
          const p = personne({
            competences: fiche(
              ...postes.map((n, i): [string, Niveau] => [
                n,
                i === 0 ? 'titulaire' : 'occasionnel',
              ]),
            ),
            shifts_autorises: codes.map(idH),
          })
          const r = rubriquesDeLaCase({
            referentiel,
            personne: p,
            jour,
            source: apresMidiMardi,
          })
          const u = codesUniques(r, p, referentiel.postes, prefere)
          const ids = u.codes.map((c) => c.horaire.id)
          expect(new Set(ids).size).toBe(ids.length)
          const union = new Set(
            r.rubriques.flatMap((x) => x.lignes.map((l) => l.horaire.id)),
          )
          expect([...ids].sort()).toEqual([...union].sort())
          for (const c of u.codes) {
            // Le poste déduit permet le code, au MEILLEUR niveau de la fiche ;
            // à ce niveau, c'est le préféré s'il le permet.
            expect(ligneDe(r, c.poste.id, c.horaire.id)).not.toBeNull()
            const candidats = r.rubriques.filter((x) =>
              x.lignes.some((l) => l.horaire.id === c.horaire.id),
            )
            const niveau = (id: number) =>
              candidats.find((x) => x.poste.id === id)?.niveau
            expect(niveau(c.poste.id)).toBe(candidats[0]?.niveau)
            if (
              prefere !== undefined &&
              niveau(prefere) === candidats[0]?.niveau
            )
              expect(c.poste.id).toBe(prefere)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('(a) le poste du shift existant s’il permet le code', () => {
    const r = rubriquesDe(BASE, {
      poste_id: idP('Club'),
      type_shift_id: idH('M'),
    })
    expect(posteDeduit(r.rubriques, idH('AM'), idP('Club'))?.nom).toBe('Club')
  })

  it('(b) sinon le premier poste de la fiche qui le permet, titulaire d’abord', () => {
    const p = personne({
      competences: fiche(['Club', 'occasionnel'], ['Réception', 'titulaire']),
    })
    const r = rubriquesDe(p)
    expect(posteDeduit(r.rubriques, idH('M'))?.nom).toBe('Réception')
    // Préféré qui ne le permet pas : on retombe sur la règle (b).
    expect(posteDeduit(r.rubriques, idH('M'), idP('Veille de nuit'))?.nom).toBe(
      'Réception',
    )
    expect(posteDeduit(r.rubriques, idH('N'))).toBeUndefined()
  })

  it('le niveau passe avant le poste du shift : M d’une titulaire Réception, shift au Club en dépannage', () => {
    const p = personne({
      competences: fiche(['Réception', 'titulaire'], ['Club', 'occasionnel']),
    })
    const r = rubriquesDe(p, { poste_id: idP('Club'), type_shift_id: idH('M') })
    // Le shift du jour est au Club, mais M est un code de son métier
    // habituel : il va en Réception.
    expect(posteDeduit(r.rubriques, idH('M'), idP('Club'))?.nom).toBe(
      'Réception',
    )
  })

  it('poste imposé (place à pourvoir) : il passe avant le niveau', () => {
    const p = personne({
      competences: fiche(['Réception', 'titulaire'], ['Club', 'occasionnel']),
    })
    const r = rubriquesDe(p)
    expect(
      posteDeduit(r.rubriques, idH('M'), undefined, idP('Club'))?.nom,
    ).toBe('Club')
    // Imposé qui ne permet pas le code : la règle du niveau reprend.
    expect(
      posteDeduit(r.rubriques, idH('M'), undefined, idP('Veille de nuit'))?.nom,
    ).toBe('Réception')
  })

  it('place à pourvoir : son poste d’abord s’il permet le code', () => {
    const r = rubriquesDe(BASE)
    const u = codesUniques(r, BASE, referentiel.postes, idP('Club'))
    expect(u.codes.find((c) => c.horaire.code === 'AM')?.poste.nom).toBe('Club')
  })

  it('étiquette seulement hors du métier habituel (poste titulaire de référence)', () => {
    const p = personne({
      competences: fiche(['Réception', 'titulaire'], ['Club', 'occasionnel']),
    })
    const surReception = codesUniques(rubriquesDe(p), p, referentiel.postes)
    expect(surReception.codes.every((c) => !c.horsHabituel)).toBe(true)
    // Place à pourvoir au Club : le poste est imposé, l'étiquette le dit.
    const surClub = codesUniques(
      rubriquesDe(p),
      p,
      referentiel.postes,
      undefined,
      idP('Club'),
    )
    expect(surClub.codes.every((c) => c.horsHabituel)).toBe(true)
    expect(surClub.codes.map((c) => c.postes.map((x) => x.nom))[0]).toEqual([
      'Réception',
      'Club',
    ])
  })

  it('coupure de 11 h : une fois, choisissable, avec son alerte', () => {
    const r = rubriquesDeLaCase({
      referentiel,
      personne: BASE,
      jour: 2,
      source: apresMidiMardi,
    })
    const u = codesUniques(r, BASE, referentiel.postes)
    const matins = u.codes.filter((c) => c.horaire.code === 'M')
    expect(matins).toHaveLength(1)
    expect(matins[0].alerte).toBe('-11 h de repos')
  })
})

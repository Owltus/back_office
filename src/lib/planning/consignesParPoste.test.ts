import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import { creneau, probleme, salarieSolveur } from '#/lib/planning/modele.ts'
import type { Creneau, SalarieSolveur } from '#/lib/planning/modele.ts'
import { bilanPresence, parMoment } from '#/lib/planning/presence.ts'
import { presenceParCycle } from '#/lib/planning/verificateur.ts'

/*
 * Le tableau du personnel PAR POSTE (décision utilisateur du 2026-11-11 :
 * « combien il me faut de personnes en réception ou au club… les postes
 * importants »). Un chiffre qui porte un poste ne se remplit QUE sur ce
 * poste : le calcul, le vérificateur et l'écran le disent pareil. Postes
 * fictifs `a` et `b`.
 */

const H = 60
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const matin = (id: string, poste: string): Creneau =>
  creneau({
    id,
    poste,
    debut: 7 * H,
    fin: 15 * H,
    effectif: 0,
    facultatif: 1,
    jourPlanning: 0,
    presence: ['matin'],
  })
const personne = (id: string, postes: string[]): SalarieSolveur =>
  salarieSolveur({
    id,
    postes: new Set(postes),
    minutesHebdoContrat: 0,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 12 * H,
    joursTravaillesMaxSemaine: 6,
    joursPreferesSemaine: 5,
    reposQuotidienMin: 11 * H,
  })
const parPoste = [
  { jour: 0, periode: 'matin', minimum: 1, maximum: 1, poste: 'a' },
  { jour: 0, periode: 'matin', minimum: 1, maximum: 1, poste: 'b' },
]

describe('un chiffre par poste', () => {
  it('chaque poste reçoit son chiffre quand l’équipe le permet', () => {
    const p = probleme({
      salaries: [personne('x', ['a']), personne('y', ['a', 'b'])],
      creneaux: [matin('ma', 'a'), matin('mb', 'b')],
      consignes: parPoste,
    })
    const r = generer(p, highs)
    expect(presenceParCycle(p, r.affectations)).toMatchObject([
      { poste: 'a', compte: 1, ecart: 0 },
      { poste: 'b', compte: 1, ecart: 0 },
    ])
  })

  it('refusé : deux personnes du seul poste a ne remplissent pas b', () => {
    // Avec un chiffre de toute la zone (2), elles l'auraient rempli.
    const p = probleme({
      salaries: [personne('x', ['a']), personne('y', ['a'])],
      creneaux: [matin('ma', 'a'), matin('mb', 'b')],
      consignes: parPoste,
    })
    const r = generer(p, highs)
    const ecarts = presenceParCycle(p, r.affectations)
    expect(ecarts.find((e) => e.poste === 'b')).toMatchObject({
      compte: 0,
      ecart: -1,
    })
  })

  it('l’écran compte poste par poste, puis réunit le moment', () => {
    const presence = bilanPresence(
      [
        {
          id: 1,
          jour: 0,
          periode: 'matin',
          minimum: 2,
          maximum: 2,
          poste_id: 1,
        },
        {
          id: 2,
          jour: 0,
          periode: 'matin',
          minimum: 1,
          maximum: 1,
          poste_id: 2,
        },
      ],
      [
        { jour: 0, periode: 'matin', poste: '1' },
        { jour: 0, periode: 'matin', poste: '1' },
        { jour: 0, periode: 'matin', poste: '1' },
      ],
    )
    expect(presence.map((x) => [x.poste, x.compte, x.ecart])).toEqual([
      ['1', 3, 1],
      ['2', 0, -1],
    ])
    // Une pastille : 3 présents pour 3 demandés, mais il en manque un au
    // poste 2 (le manque passe devant).
    expect(parMoment(presence)).toMatchObject([
      { compte: 3, minimum: 3, ecart: -1 },
    ])
  })
})

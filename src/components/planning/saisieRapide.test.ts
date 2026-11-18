import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  autresShifts,
  codesUniques,
  rubriquesDeLaCase,
  TEXTE_DEPASSE_SEMAINE,
  TEXTE_REPOS_FIXE,
} from '#/components/planning/codesCase.ts'
import type { SourceCase } from '#/components/planning/codesCase.ts'
import {
  clicDeCopie,
  copieDe,
  libelleCopie,
  libelleValidationPeriode,
  memeShift,
  shiftsAChanger,
  styleSource,
  toucheCopie,
} from '#/components/planning/saisieRapide.ts'
import { analyser } from '#/lib/planning/semaine.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import { ajouterJours } from '#/lib/planning/temps.ts'

/*
 * Saisie rapide du planning (demande utilisateur du 2026-11-18). Oracles :
 * la demande elle-même (mêmes règles que `planning_valider_periode`, recopiées
 * ici à la main ; un collage recopie le shift sans la personne, le jour ni la
 * validation ; tous les horaires possibles à la main, avertis sans blocage).
 */

const LUNDI = '2026-11-02'

describe('shiftsAChanger : ce que la base changera', () => {
  const sem = (
    lundi: string,
    affectations: Array<{
      salarie_id: number
      jour: number
      epinglee: boolean
    }>,
    verrouillee = false,
  ) => ({ lundi, verrouillee, affectations })
  const periode = { salaries: [1], du: LUNDI, au: ajouterJours(LUNDI, 13) }

  it('compte les propositions de la personne, hors autres personnes', () => {
    const n = shiftsAChanger(
      [
        sem(LUNDI, [
          { salarie_id: 1, jour: 0, epinglee: false },
          { salarie_id: 1, jour: 1, epinglee: true },
          { salarie_id: 2, jour: 2, epinglee: false },
        ]),
      ],
      periode,
      true,
      LUNDI,
      false,
    )
    expect(n).toBe(1)
  })

  it('saute une semaine verrouillée et ce qui sort de la période', () => {
    const n = shiftsAChanger(
      [
        sem(LUNDI, [{ salarie_id: 1, jour: 0, epinglee: false }], true),
        sem(ajouterJours(LUNDI, 7), [
          { salarie_id: 1, jour: 1, epinglee: false },
        ]),
        sem(ajouterJours(LUNDI, 14), [
          { salarie_id: 1, jour: 0, epinglee: false },
        ]),
      ],
      periode,
      true,
      LUNDI,
      false,
    )
    expect(n).toBe(1)
  })

  it('un jour passé ne redevient une proposition que pour la gestion', () => {
    const semaines = [
      sem(LUNDI, [
        { salarie_id: 1, jour: 0, epinglee: true },
        { salarie_id: 1, jour: 3, epinglee: true },
      ]),
    ]
    const auj = ajouterJours(LUNDI, 2)
    expect(shiftsAChanger(semaines, periode, false, auj, false)).toBe(1)
    expect(shiftsAChanger(semaines, periode, false, auj, true)).toBe(2)
    // Valider un jour passé reste permis.
    expect(
      shiftsAChanger(
        [sem(LUNDI, [{ salarie_id: 1, jour: 0, epinglee: false }])],
        periode,
        true,
        auj,
        false,
      ),
    ).toBe(1)
  })

  it('propriété : valider et invalider ne comptent jamais le même shift', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            salarie_id: fc.integer({ min: 1, max: 3 }),
            jour: fc.integer({ min: 0, max: 6 }),
            epinglee: fc.boolean(),
          }),
          { maxLength: 20 },
        ),
        fc.boolean(),
        (affectations, gerer) => {
          const semaines = [sem(LUNDI, affectations)]
          const tous = affectations.filter((a) => a.salarie_id === 1).length
          const v = shiftsAChanger(semaines, periode, true, LUNDI, gerer)
          const i = shiftsAChanger(semaines, periode, false, LUNDI, gerer)
          return v + i === tous
        },
      ),
    )
  })

  it('libellés : le nombre, le singulier, ou « tous » quand rien ne change', () => {
    expect(libelleValidationPeriode(22, true)).toBe('Valider 22 shifts')
    expect(libelleValidationPeriode(1, false)).toBe('Invalider 1 shift')
    expect(libelleValidationPeriode(0, true)).toBe('Valider tous les shifts')
  })
})

describe('copie au Ctrl', () => {
  const shift = {
    poste_id: 2,
    type_shift_id: 5,
    debut: '07:00',
    fin: '15:45',
    pause: 45,
  }

  it('recopie le poste, l’horaire, les heures et la pause, rien d’autre', () => {
    expect(copieDe(shift)).toEqual({
      poste_id: 2,
      horaire_id: 5,
      debut: '07:00',
      fin: '15:45',
      pause: 45,
    })
    // Un horaire spécifique se recopie par ses heures.
    expect(copieDe({ ...shift, type_shift_id: null }).horaire_id).toBeNull()
    expect(libelleCopie(copieDe(shift))).toBe('07:00–15:45')
  })

  it('un shift identique n’est pas réécrit (il perdrait sa validation)', () => {
    expect(memeShift(shift, copieDe(shift))).toBe(true)
    expect(memeShift({ ...shift, poste_id: 3 }, copieDe(shift))).toBe(false)
    expect(memeShift({ ...shift, fin: '16:00' }, copieDe(shift))).toBe(false)
  })

  it('Cmd sur Mac, Ctrl ailleurs', () => {
    expect(toucheCopie('MacIntel')).toBe('Meta')
    expect(toucheCopie('Win32')).toBe('Control')
    expect(clicDeCopie({ ctrlKey: true, metaKey: false }, 'Control')).toBe(true)
    // Ctrl + clic sur Mac ouvre le menu contextuel : ce n'est pas la copie.
    expect(clicDeCopie({ ctrlKey: true, metaKey: false }, 'Meta')).toBe(false)
  })

  it('la règle de la case source refuse toute valeur hors nombres et dates', () => {
    expect(styleSource('data-case', '12:3')).toContain('[data-case="12:3"]')
    expect(styleSource('data-case-mois', '12|2026-11-02')).toContain(
      '[data-case-mois="12|2026-11-02"]',
    )
    expect(styleSource('data-case', '1"]{}*{')).toBe('')
  })
})

describe('autresShifts : tous les horaires à la main', () => {
  const { referentiel, absences } = hotelDemo(LUNDI)
  const personne = referentiel.salaries.find((s) => s.id === 3)!
  const semaine = analyser({
    lundi: LUNDI,
    referentiel,
    absences,
    affectations: [],
    avant: [],
    apres: [],
  })
  const source: SourceCase = { semaine }

  const autres = (p = personne, s = source, jour = 2) => {
    const u = codesUniques(
      rubriquesDeLaCase({ referentiel, personne: p, jour, source: s }),
      p,
      referentiel.postes,
    )
    return {
      u,
      autres: autresShifts({
        referentiel,
        personne: p,
        jour,
        source: s,
        deja: new Set(u.codes.map((c) => c.horaire.id)),
      }),
    }
  }

  it('la liste habituelle et les autres font, ensemble, tous les horaires', () => {
    const { u, autres: a } = autres({
      ...personne,
      shifts_autorises: [referentiel.horaires[0].id],
    })
    const ids = new Set([
      ...u.codes.map((c) => c.horaire.id),
      ...a.map((c) => c.horaire.id),
    ])
    expect(ids.size).toBe(referentiel.horaires.length)
    // Chaque horaire une seule fois.
    expect(u.codes.length + a.length).toBe(referentiel.horaires.length)
  })

  it('un repos fixe est dit sur chaque ligne, sans rien retirer', () => {
    const p = {
      ...personne,
      semaine_type: personne.semaine_type.map((j, i) =>
        i === 2 ? { mode: 'repos' as const } : j,
      ),
    }
    const { u, autres: a } = autres(p)
    expect(u.codes).toHaveLength(0)
    expect(a).toHaveLength(referentiel.horaires.length)
    expect(a.every((c) => c.alerte?.includes(TEXTE_REPOS_FIXE))).toBe(true)
  })

  it('la limite de la semaine dépassée est dite', () => {
    const plein = {
      ...semaine,
      bilan: semaine.bilan.map((b) =>
        b.salarie_id === personne.id
          ? { ...b, minutes: b.minutes_max, minutes_max: b.minutes_max }
          : b,
      ),
    } as SemaineOut
    const { autres: a } = autres(
      { ...personne, shifts_autorises: [referentiel.horaires[0].id] },
      { semaine: plein },
    )
    expect(a.length).toBeGreaterThan(0)
    expect(a.every((c) => c.alerte?.includes(TEXTE_DEPASSE_SEMAINE))).toBe(true)
  })

  it('jamais sur un poste fermé, et rien un jour hors contrat', () => {
    const { autres: a } = autres({
      ...personne,
      shifts_autorises: [referentiel.horaires[0].id],
    })
    expect(a.every((c) => !c.poste.ferme)).toBe(true)
    const hors = {
      ...semaine,
      bilan: semaine.bilan.map((b) =>
        b.salarie_id === personne.id ? { ...b, hors_contrat: [2] } : b,
      ),
    } as SemaineOut
    expect(autres(personne, { semaine: hors }).autres).toHaveLength(0)
  })
})

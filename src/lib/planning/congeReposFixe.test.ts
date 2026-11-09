import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Highs } from '#/lib/planning/generateur.ts'
import {
  absenceIgnoree,
  absencesDecompteesMax,
  contexte,
  fiche,
  joursSautesReposFixes,
  phraseReposFixes,
  refusAbsenceSurReposFixe,
  reposDusSemaine,
} from '#/lib/planning/semaine.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { reposAValider } from '#/components/planning/semaine/edition.ts'
import { phrasePeriodeReposFixes } from '#/components/planning/parametres/equipe/brouillon.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import { PlanningMemoire } from '#/lib/planning/test/planningMemoire.ts'
import { ajouterJours } from '#/lib/planning/temps.ts'
import type { JourType, Motif, Salarie } from '#/lib/planning/types.ts'

/*
 * Congés et repos (décision utilisateur du 2026-11-09) :
 *   R1 : une absence décomptée sur un repos fixe de la semaine type est
 *        ignorée (le jour reste un repos fixe : ni heures dues, ni jours
 *        pris, un repos pour le rythme, montré comme tel ; la saisie d'une
 *        plage saute ces jours) ;
 *   R2 : au plus `7 - 2 repos dus` jours d'absence décomptée par semaine
 *        civile ; les jours en trop sont des repos proposés (`placerRepos`),
 *        que « Valider » écrit à la place du congé.
 * Oracles écrits à la main, sur l'hôtel fictif de démonstration.
 */

const H = 60
const AUJOURDHUI = '2026-09-01'

let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

function demo(): PlanningMemoire {
  const { referentiel, absences } = hotelDemo('2026-11-02')
  return new PlanningMemoire(referentiel, absences, AUJOURDHUI, highs)
}

/** Le veilleur de la démo (39 h, la nuit seule), sans absence. */
function veilleur(p: PlanningMemoire): Salarie {
  const x = p.salarie('Karim')
  p.absences = p.absences.filter((a) => a.salarie_id !== x.id)
  return x
}

/** Semaine type du cas réel : nuits du lundi au jeudi, vendredi et samedi
 * en repos fixes, la nuit du dimanche avec l'étoile. */
function semaineDuCasReel(p: PlanningMemoire): JourType[] {
  const n = p.horaire('N').id
  return [0, 1, 2, 3, 4, 5, 6].map((j): JourType =>
    j === 4 || j === 5
      ? { mode: 'repos' }
      : {
          mode: 'travail',
          type_shift_id: n,
          ...(j === 6 ? { etoile: true } : {}),
        },
  )
}

const bilanDe = (sem: SemaineOut, id: number) =>
  sem.bilan.find((b) => b.salarie_id === id)!
const absentsDe = (sem: SemaineOut, id: number) =>
  Object.keys(bilanDe(sem, id).absences)
    .map(Number)
    .sort((a, b) => a - b)
/** Repos proposés sur un congé en trop (R2) : ceux que l'écran montre. */
const reposSurConge = (sem: SemaineOut, id: number) => {
  const b = bilanDe(sem, id)
  return b.repos_deduits.filter((j) => j in b.absences)
}
const joursDe = (sem: SemaineOut, id: number) =>
  new Set(
    sem.affectations.filter((a) => a.salarie_id === id).map((a) => a.jour),
  )

const motifsTest: Motif[] = [
  {
    id: 1,
    code: 'CP',
    nom: 'Congés',
    couleur: '',
    decompte: true,
    nature: 'absence',
  },
  {
    id: 2,
    code: 'EC',
    nom: 'École',
    couleur: '',
    decompte: true,
    nature: 'ecole',
  },
  {
    id: 3,
    code: 'RP',
    nom: 'Repos exc.',
    couleur: '',
    decompte: false,
    nature: 'absence',
  },
  {
    id: 4,
    code: 'R',
    nom: 'Repos',
    couleur: '',
    decompte: false,
    nature: 'repos',
  },
]
const semaineVS: JourType[] = [0, 1, 2, 3, 4, 5, 6].map((j) =>
  j === 4 || j === 5 ? { mode: 'repos' } : { mode: 'auto' },
)

describe('R1 : absenceIgnoree, une seule définition', () => {
  it('un congé sur un repos fixe : ignoré', () => {
    // 2026-12-25 est un vendredi, 2026-12-26 un samedi.
    expect(absenceIgnoree(semaineVS, '2026-12-25', motifsTest[0])).toBe(true)
    expect(absenceIgnoree(semaineVS, '2026-12-26', motifsTest[0])).toBe(true)
  })

  it('refusé : un jour qui n’est pas un repos fixe, l’école, un motif sans décompte ou de nature repos', () => {
    expect(absenceIgnoree(semaineVS, '2026-12-24', motifsTest[0])).toBe(false)
    expect(absenceIgnoree(semaineVS, '2026-12-25', motifsTest[1])).toBe(false)
    expect(absenceIgnoree(semaineVS, '2026-12-25', motifsTest[2])).toBe(false)
    expect(absenceIgnoree(semaineVS, '2026-12-25', motifsTest[3])).toBe(false)
    expect(absenceIgnoree(semaineVS, '2026-12-25', undefined)).toBe(false)
    expect(
      absenceIgnoree(
        semaineVS.map(() => ({ mode: 'auto' })),
        '2026-12-25',
        motifsTest[0],
      ),
    ).toBe(false)
  })
})

describe('R1 : la saisie d’une plage saute les repos fixes', () => {
  const plage = (de: string, a: string, motif = 1) => {
    const r = new Map<string, number>()
    for (let d = de; d <= a; d = ajouterJours(d, 1)) r.set(d, motif)
    return r
  }

  it('trois semaines d’un coup : seuls les vendredis et samedis sont sautés', () => {
    const sautes = joursSautesReposFixes(
      plage('2026-12-20', '2027-01-09'),
      semaineVS,
      motifsTest,
    )
    expect(sautes).toEqual([
      '2026-12-25',
      '2026-12-26',
      '2027-01-01',
      '2027-01-02',
      '2027-01-08',
      '2027-01-09',
    ])
    expect(phraseReposFixes(sautes)).toBe(
      'Les vendredis et samedis sont ses repos : ils restent des repos.',
    )
  })

  it('un seul jour : la phrase au singulier', () => {
    expect(phraseReposFixes(['2026-12-26'])).toBe(
      'Le samedi est son repos : il reste un repos.',
    )
    expect(phraseReposFixes([])).toBe('')
  })

  it('refusé : l’école n’est pas sautée, ni un jour déjà enregistré tel quel', () => {
    expect(
      joursSautesReposFixes(
        plage('2026-12-21', '2026-12-27', 2),
        semaineVS,
        motifsTest,
      ),
    ).toEqual([])
    // Déjà en base avec le même motif : la saisie ne le touche pas (rien
    // n'est effacé), il n'est donc pas « sauté ».
    expect(
      joursSautesReposFixes(
        plage('2026-12-21', '2026-12-27'),
        semaineVS,
        motifsTest,
        new Map([['2026-12-25', 1]]),
      ),
    ).toEqual(['2026-12-26'])
  })

  it('la phrase d’une période de la fiche, et le refus du planning', () => {
    const periode = { debut: '2026-12-20', fin: '2026-12-26', motif_id: 1 }
    expect(phrasePeriodeReposFixes(periode, semaineVS, motifsTest)).toBe(
      'Les vendredis et samedis sont ses repos : ils restent des repos.',
    )
    expect(
      phrasePeriodeReposFixes(
        { ...periode, fin: '2026-12-24' },
        semaineVS,
        motifsTest,
      ),
    ).toBe('')
    const ref = {
      salaries: [{ id: 7, semaine_type: semaineVS } as Salarie],
      motifs: motifsTest,
    }
    expect(refusAbsenceSurReposFixe(ref, 7, '2026-12-25', 1)).toBe(
      'Le vendredi est son repos : il reste un repos.',
    )
    expect(refusAbsenceSurReposFixe(ref, 7, '2026-12-24', 1)).toBe('')
    expect(refusAbsenceSurReposFixe(ref, 7, '2026-12-25', null)).toBe('')
    expect(refusAbsenceSurReposFixe(ref, 7, '2026-12-25', 2)).toBe('')
  })
})

describe('R2 : repos dus et absences décomptées au plus', () => {
  it('5 jours d’absence décomptée au plus, hors contrat compris', () => {
    expect([0, 1, 2, 3, 4, 7].map(reposDusSemaine)).toEqual([2, 1, 0, 0, 0, 0])
    expect([0, 1, 2, 3, 4, 7].map(absencesDecompteesMax)).toEqual([
      5, 5, 5, 4, 3, 0,
    ])
  })
})

describe('le cas réel : veilleur 39 h, repos fixes vendredi et samedi', () => {
  // Congé du dimanche 15 au samedi 21 novembre, posé d'un coup ; les jours
  // du vendredi et du samedi sont déjà en base (avant la règle).
  const cas = () => {
    const p = demo()
    const x = veilleur(p)
    x.semaine_type = semaineDuCasReel(p)
    p.absent(x.id, '2026-11-15', '2026-11-21', 'CP')
    return { p, x }
  }

  it('la semaine du 16 : 4 congés, ses 2 repos fixes, 8 h dues', () => {
    const { p, x } = cas()
    const sem = p.analyser('2026-11-16')
    // L'écran montre les repos fixes, pas le congé.
    expect(absentsDe(sem, x.id)).toEqual([0, 1, 2, 3])
    expect(bilanDe(sem, x.id).repos_fixes).toEqual([4, 5])
    expect(reposSurConge(sem, x.id)).toEqual([])
    // Accepté puis refusé : 4 jours décomptés laissent une journée de 8 h
    // (l'étoile saute la semaine d'un congé) ; sans R1, 6 congés = rien dû.
    expect(bilanDe(sem, x.id).minutes_contrat).toBe(8 * H)
    expect(bilanDe(sem, x.id).minutes_contrat).not.toBe(0)
  })

  it('le calcul pose la nuit du dimanche 22, puis refait 5 nuits', () => {
    const { p, x } = cas()
    p.fixes('2026-11-16')
    const sem = p.generer('2026-11-16')
    expect(joursDe(sem, x.id)).toEqual(new Set([6]))
    p.fixes('2026-11-23')
    const suite = p.generer('2026-11-23')
    expect(joursDe(suite, x.id)).toEqual(new Set([0, 1, 2, 3, 6]))
  })

  it('rythme : vendredi et samedi sont des repos, le congé du dimanche au jeudi un bloc de 5', () => {
    const { p, x } = cas()
    const d = p.donnees('2026-11-16')
    const f = fiche(x, d.lundi, contexte(d))
    expect([...(f.indisponibilites ?? [])].sort()).toEqual([0, 1, 2, 3])
    expect([...(f.joursTravailRythme ?? [])].sort()).toEqual([0, 1, 2, 3])
    expect([...(f.joursNeutres ?? [])]).toEqual([])
    expect(f.joursAbsenceDecomptes).toBe(4)
  })
})

describe('trois semaines d’un coup', () => {
  it('avec repos fixes : 5 congés par semaine, aucun repos à proposer', () => {
    const p = demo()
    const x = veilleur(p)
    x.semaine_type = semaineDuCasReel(p)
    p.absent(x.id, '2026-11-09', '2026-11-29', 'CP')
    for (const l of ['2026-11-09', '2026-11-16', '2026-11-23']) {
      const sem = p.analyser(l)
      expect(absentsDe(sem, x.id), l).toEqual([0, 1, 2, 3, 6])
      expect(bilanDe(sem, x.id).repos_fixes).toEqual([4, 5])
      expect(reposSurConge(sem, x.id), l).toEqual([])
      expect(bilanDe(sem, x.id).minutes_contrat).toBe(0)
    }
  })

  it('sans repos fixes : 2 repos proposés par semaine, samedi et dimanche, validables', () => {
    const p = demo()
    const x = veilleur(p)
    p.absent(x.id, '2026-11-09', '2026-11-29', 'CP')
    for (const l of ['2026-11-09', '2026-11-16', '2026-11-23']) {
      const sem = p.analyser(l)
      expect(absentsDe(sem, x.id)).toEqual([0, 1, 2, 3, 4, 5, 6])
      expect(reposSurConge(sem, x.id), l).toEqual([5, 6])
      expect(reposAValider(sem, null, x.id).map((r) => r.jour)).toEqual([5, 6])
      const d = p.donnees(l)
      // Heures dues : 5 jours décomptés au plus.
      expect(fiche(x, d.lundi, contexte(d)).joursAbsenceDecomptes).toBe(5)
    }
  })
})

describe('R2 sans repos fixes', () => {
  it('6 congés dans la semaine : 1 repos proposé sur le congé', () => {
    const p = demo()
    const x = veilleur(p)
    p.absent(x.id, '2026-11-16', '2026-11-21', 'CP')
    const sem = p.analyser('2026-11-16')
    expect(reposSurConge(sem, x.id)).toEqual([5])
    expect(reposAValider(sem, null, x.id).map((r) => r.jour)).toEqual([5])
    // Refusé : 5 congés, aucun repos sur un congé.
    const q = demo()
    const y = veilleur(q)
    q.absent(y.id, '2026-11-16', '2026-11-20', 'CP')
    expect(reposSurConge(q.analyser('2026-11-16'), y.id)).toEqual([])
  })

  it('à cheval sur deux semaines, du dimanche au samedi : 1 repos proposé, collé au dimanche libre', () => {
    const p = demo()
    const x = veilleur(p)
    p.absent(x.id, '2026-11-15', '2026-11-21', 'CP')
    expect(reposSurConge(p.analyser('2026-11-09'), x.id)).toEqual([])
    expect(reposSurConge(p.analyser('2026-11-16'), x.id)).toEqual([5])
  })

  it('un seul repos fixe : il compte dans les 2, R2 complète d’un repos', () => {
    const p = demo()
    const x = veilleur(p)
    x.semaine_type = x.semaine_type.map((_, j) =>
      j === 5 ? { mode: 'repos' } : { mode: 'auto' },
    )
    p.absent(x.id, '2026-11-16', '2026-11-22', 'CP')
    const sem = p.analyser('2026-11-16')
    // Le samedi reste son repos fixe (R1) ; le dimanche, collé, devient un
    // repos proposé (R2) ; il reste 5 jours de congé.
    expect(absentsDe(sem, x.id)).toEqual([0, 1, 2, 3, 4, 6])
    expect(bilanDe(sem, x.id).repos_fixes).toEqual([5])
    expect(reposSurConge(sem, x.id)).toEqual([6])
  })
})

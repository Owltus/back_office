import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  CODE_JFR,
  estJfr,
  feriesARattraper,
  feriesEntre,
  ferieDe,
  joursFeries,
  paques,
  premierLundiLu,
} from '#/lib/planning/feries.ts'
import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import { creneau, salarieSolveur } from '#/lib/planning/modele.ts'
import {
  droitAuRattrapage,
  heuresDues,
  reductionJourFerie,
} from '#/lib/planning/regles.ts'
import type { Fiche } from '#/lib/planning/regles.ts'
import {
  analyser,
  fiche,
  contexte,
  preparerGeneration,
} from '#/lib/planning/semaine.ts'
import type { DonneesSemaine, NouveauShift } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import { ajouterJours } from '#/lib/planning/temps.ts'
import type { Absence, Affectation, Motif } from '#/lib/planning/types.ts'
import { violationsSalarie } from '#/lib/planning/verificateur.ts'

/*
 * Jours fériés rattrapés (R-FERIE-RATTRAPE, décisions utilisateur du
 * 2026-11-02) : la première année, aucun jour férié ; ensuite, un jour férié
 * travaillé est rattrapé par un JFR, placé par la génération dans les
 * semaines qui suivent. Date d'entrée vide : moins d'un an.
 */

describe('jours fériés de France', () => {
  it('Pâques (Meeus, Jones et Butcher)', () => {
    expect(paques(2024)).toBe('2024-03-31')
    expect(paques(2025)).toBe('2025-04-20')
    expect(paques(2026)).toBe('2026-04-05')
    expect(paques(2027)).toBe('2027-03-28')
    expect(paques(2038)).toBe('2038-04-25')
  })

  it('les 11 jours de 2026, dans l’ordre', () => {
    expect(joursFeries(2026).map((f) => f.date)).toEqual([
      '2026-01-01',
      '2026-04-06',
      '2026-05-01',
      '2026-05-08',
      '2026-05-14',
      '2026-05-25',
      '2026-07-14',
      '2026-08-15',
      '2026-11-01',
      '2026-11-11',
      '2026-12-25',
    ])
  })

  it('les jours mobiles de 2027', () => {
    expect(ferieDe('2027-03-29')).toBe('Lundi de Pâques')
    expect(ferieDe('2027-05-06')).toBe('Ascension')
    expect(ferieDe('2027-05-17')).toBe('Lundi de Pentecôte')
    expect(joursFeries(2027)).toHaveLength(11)
  })

  it('un jour ordinaire n’est pas férié', () => {
    expect(ferieDe('2026-11-11')).toBe('Armistice 1918')
    expect(ferieDe('2026-11-12')).toBeNull()
    expect(ferieDe('2026-04-05')).toBeNull() // Pâques : un dimanche, non compté
  })

  it('entre deux dates, années à cheval comprises', () => {
    expect(feriesEntre('2026-12-20', '2027-01-05').map((f) => f.date)).toEqual([
      '2026-12-25',
      '2027-01-01',
    ])
    expect(feriesEntre('2026-11-12', '2026-11-30')).toEqual([])
  })

  it('le motif JFR se reconnaît à son code', () => {
    expect(estJfr({ code: CODE_JFR })).toBe(true)
    expect(estJfr({ code: ' jfr ' })).toBe(true)
    expect(estJfr({ code: 'JF' })).toBe(false)
  })

  it('les vues lisent huit semaines avant le lundi', () => {
    // Quatre semaines de fenêtre, et quatre d'avant pour que les jours
    // fériés plus anciens prennent d'abord leurs JFR.
    expect(premierLundiLu('2026-11-16')).toBe('2026-09-21')
  })
})

describe('droit au rattrapage', () => {
  const x = (date_entree: string | null, type_contrat = 'cdi' as const) => ({
    date_entree,
    type_contrat,
  })

  it('date d’entrée vide : moins d’un an, aucun droit', () => {
    expect(droitAuRattrapage(x(null), '2026-11-11')).toBe(false)
  })

  it('11 mois : aucun droit ; un an pile : droit', () => {
    expect(droitAuRattrapage(x('2025-12-11'), '2026-11-11')).toBe(false)
    expect(droitAuRattrapage(x('2025-11-12'), '2026-11-11')).toBe(false)
    expect(droitAuRattrapage(x('2025-11-11'), '2026-11-11')).toBe(true)
    expect(droitAuRattrapage(x('2020-03-01'), '2026-11-11')).toBe(true)
  })

  it('ni extra, ni stagiaire ; un apprenti oui', () => {
    expect(
      droitAuRattrapage(
        { ...x('2020-01-01'), type_contrat: 'extra' },
        '2026-11-11',
      ),
    ).toBe(false)
    expect(
      droitAuRattrapage(
        { ...x('2020-01-01'), type_contrat: 'stagiaire' },
        '2026-11-11',
      ),
    ).toBe(false)
    expect(
      droitAuRattrapage(
        { ...x('2020-01-01'), type_contrat: 'apprenti' },
        '2026-11-11',
      ),
    ).toBe(true)
    expect(
      droitAuRattrapage(
        { ...x('2020-01-01'), type_contrat: 'cdd' },
        '2026-11-11',
      ),
    ).toBe(true)
  })

  it('un JFR vaut un jour de congé dans les heures dues', () => {
    const f: Fiche = {
      id: '1',
      postes: new Set(),
      typeContrat: 'cdi',
      minutesHebdo: 35 * 60,
    }
    expect(reductionJourFerie(f)).toBe(7 * 60)
    const f39 = { ...f, minutesHebdo: 39 * 60 }
    // 39 h et un congé : 4 × 8 h, comme `heuresDues`.
    expect(reductionJourFerie(f39)).toBe(
      heuresDues(f39) - heuresDues({ ...f39, joursAbsenceDecomptes: 1 }),
    )
    expect(reductionJourFerie(f39)).toBe(7 * 60)
  })
})

describe('solde des jours fériés', () => {
  const salarie = { type_contrat: 'cdi' as const, date_entree: '2020-01-01' }
  it('un jour férié travaillé, puis rattrapé', () => {
    const base = {
      salarie,
      du: '2026-10-19',
      au: '2026-11-22',
      travailles: new Set(['2026-11-01', '2026-11-11', '2026-11-12']),
    }
    expect(
      feriesARattraper({ ...base, jfrPoses: [] }).map((f) => f.date),
    ).toEqual(['2026-11-01', '2026-11-11'])
    // Le plus ancien est rattrapé d'abord.
    expect(
      feriesARattraper({ ...base, jfrPoses: ['2026-11-05'] }).map(
        (f) => f.date,
      ),
    ).toEqual(['2026-11-11'])
    expect(
      feriesARattraper({ ...base, jfrPoses: ['2026-11-05', '2026-11-18'] }),
    ).toEqual([])
    // Un JFR d'avant le jour férié ne le rattrape pas.
    expect(
      feriesARattraper({ ...base, jfrPoses: ['2026-10-25'] }),
    ).toHaveLength(2)
  })

  // Le 1er puis le 11 novembre travaillés, un seul JFR le 12 : il rattrape
  // le 1er (le plus ancien). Vu depuis une semaine où le 1er est sorti de la
  // fenêtre, le 11 doit rester à rattraper.
  const novembre = {
    salarie,
    travailles: new Set(['2026-11-01', '2026-11-11']),
    jfrPoses: ['2026-11-12'],
  }
  const vuLe = (lundi: string) =>
    feriesARattraper({
      ...novembre,
      du: ajouterJours(lundi, -28),
      au: ajouterJours(lundi, 6),
      depuis: ajouterJours(lundi, -56),
    }).map((f) => f.date)

  it('accepté : un JFR ne sert qu’une fois, même quand son jour férié sort de la fenêtre', () => {
    expect(vuLe('2026-11-16')).toEqual(['2026-11-11'])
    expect(vuLe('2026-11-23')).toEqual(['2026-11-11'])
    // Le 1er est hors fenêtre (du = 2 novembre), le 11 y est encore.
    expect(vuLe('2026-11-30')).toEqual(['2026-11-11'])
    // Le 11 sort à son tour de la fenêtre : plus rien.
    expect(vuLe('2026-12-14')).toEqual([])
    // Deux JFR : les deux jours fériés sont rattrapés.
    expect(
      feriesARattraper({
        ...novembre,
        jfrPoses: ['2026-11-12', '2026-11-20'],
        du: '2026-11-02',
        au: '2026-12-06',
        depuis: '2026-10-05',
      }),
    ).toEqual([])
  })

  it('refusé : sans les jours fériés d’avant la fenêtre, le JFR du 1er rattraperait le 11', () => {
    // Imputation limitée à la fenêtre (pas de `depuis`) : le JFR du 12 est
    // compté pour le 11, à tort. C'est ce que `depuis` empêche.
    expect(
      feriesARattraper({ ...novembre, du: '2026-11-02', au: '2026-12-06' }),
    ).toEqual([])
    expect(vuLe('2026-11-30')).not.toEqual([])
  })

  it('sans shift ce jour-là, ou sans droit : rien', () => {
    expect(
      feriesARattraper({
        salarie,
        du: '2026-11-01',
        au: '2026-11-22',
        travailles: new Set(['2026-11-10']),
        jfrPoses: [],
      }),
    ).toEqual([])
    expect(
      feriesARattraper({
        salarie: { ...salarie, date_entree: null },
        du: '2026-11-01',
        au: '2026-11-22',
        travailles: new Set(['2026-11-11']),
        jfrPoses: [],
      }),
    ).toEqual([])
  })
})

describe('le vérificateur rappelle un jour férié à rattraper', () => {
  const s = salarieSolveur({
    id: '1',
    postes: new Set(['1']),
    minutesHebdoContrat: 0,
    minutesHebdoMax: 48 * 60,
    minutesJourMax: 12 * 60,
    joursTravaillesMaxSemaine: 6,
    reposQuotidienMin: 11 * 60,
  })
  it('accepté : rien à rattraper, aucune alerte', () => {
    expect(
      violationsSalarie(s, [], 7).filter((v) => v.regle === 'JOUR-FERIE'),
    ).toEqual([])
  })
  it('refusé : un jour férié travaillé reste à rattraper', () => {
    const v = violationsSalarie(
      { ...s, feriesARattraper: ['2026-11-11'] },
      [],
      7,
    ).filter((x) => x.regle === 'JOUR-FERIE')
    expect(v).toHaveLength(1)
    expect(v[0].message).toBe('jour férié du 11/11 travaillé : à rattraper')
    expect(v[0].nature).toBe('organisation')
  })
})

// ------------------------------------------------------------ génération

let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const LUNDI = '2026-11-16' // la semaine après le mercredi 11 novembre
const AVANT = '2026-11-09'
const AUJOURDHUI = '2026-11-14'
const JFR: Motif = {
  id: 77,
  code: 'JFR',
  nom: 'Jour férié rattrapé',
  couleur: '#c084fc',
  decompte: true,
  nature: 'absence',
}
// Une personne à 39 h, Réception et Club, qui a travaillé le 11/11.
const ID = 3

function donnees(
  entree: string | null,
  absences: Absence[] = [],
  affectations: Affectation[] = [],
): DonneesSemaine {
  const demo = hotelDemo(LUNDI)
  const salaries = demo.referentiel.salaries.map((x) =>
    x.id === ID ? { ...x, date_entree: entree } : x,
  )
  const reception = demo.referentiel.postes.find((p) => p.nom === 'Réception')!
  const matin = demo.referentiel.besoins.find(
    (b) => b.poste_id === reception.id && b.effectif > 0,
  )!
  const ferie: Affectation = {
    id: 9001,
    lundi: AVANT,
    salarie_id: ID,
    poste_id: reception.id,
    jour: 2, // mercredi 11 novembre
    horaire_id: matin.horaire_id,
    debut: matin.debut,
    fin: matin.fin,
    epinglee: true,
    pause: 0,
  }
  return {
    lundi: LUNDI,
    referentiel: {
      ...demo.referentiel,
      salaries,
      motifs: [...demo.referentiel.motifs, JFR],
    },
    absences: [...demo.absences, ...absences],
    affectations,
    avant: [ferie],
    apres: [],
  }
}

function poser(nouveaux: NouveauShift[]): Affectation[] {
  return nouveaux.map((n, i) => ({
    id: 1000 + i,
    lundi: LUNDI,
    ...n,
    epinglee: false,
  }))
}

describe('la génération place le JFR', () => {
  it('avec droit : un JFR la semaine suivante, un jour sans shift, une journée de moins', () => {
    const d = donnees('2024-01-01')
    const g = preparerGeneration(d, { aujourdhui: AUJOURDHUI, graine: 1 })
    const sol = g.probleme.salaries.find((s) => s.id === String(ID))!
    expect(sol.jfr?.reduction).toBe(7 * 60)
    expect(sol.jfr?.jours.size).toBeGreaterThan(0)
    const r = generer(g.probleme, highs)
    expect(r.statut).toBe('optimal')
    const absences = g.absences(r)
    expect(absences).toHaveLength(1)
    expect(absences[0]).toMatchObject({ salarie_id: ID, motif_id: JFR.id })
    const shifts = g.traduire(r).filter((n) => n.salarie_id === ID)
    expect(shifts.map((n) => n.jour)).not.toContain(absences[0].jour)
    // La semaine analysée avec le JFR posé : heures dues d'une journée de
    // moins (39 h → 32 h), plus d'alerte, JFR en proposition.
    const jfr: Absence = {
      id: 5000,
      salarie_id: ID,
      jour: ajouterJours(LUNDI, absences[0].jour),
      motif_id: JFR.id,
      epinglee: false,
    }
    const semaine = analyser({
      ...d,
      absences: [...d.absences, jfr],
      affectations: poser(g.traduire(r)),
    })
    const b = semaine.bilan.find((x) => x.salarie_id === ID)!
    expect(b.minutes_contrat).toBe(32 * 60)
    expect(b.minutes).toBe(32 * 60)
    expect(b.jfr_proposes).toEqual([absences[0].jour])
    expect(b.repos_proposes).toEqual([])
    expect(b.alertes.some((a) => a.regle === 'JOUR-FERIE')).toBe(false)
    expect(semaine.stats.infractions).toBe(0)
  })

  it('sans date d’entrée (moins d’un an) : aucun JFR, aucune alerte', () => {
    const d = donnees(null)
    const g = preparerGeneration(d, { aujourdhui: AUJOURDHUI, graine: 1 })
    expect(g.probleme.salaries.find((s) => s.id === String(ID))?.jfr).toBeNull()
    expect(g.absences(generer(g.probleme, highs))).toEqual([])
    const b = analyser(d).bilan.find((x) => x.salarie_id === ID)!
    expect(b.alertes.some((a) => a.regle === 'JOUR-FERIE')).toBe(false)
  })

  it('l’analyse rappelle le jour férié tant que le JFR n’est pas posé', () => {
    const b = analyser(donnees('2024-01-01')).bilan.find(
      (x) => x.salarie_id === ID,
    )!
    expect(b.alertes.filter((a) => a.regle === 'JOUR-FERIE')).toEqual([
      expect.objectContaining({
        message: 'jour férié du 11/11 travaillé : à rattraper',
      }),
    ])
  })

  it('un JFR déjà validé : rien de plus à placer', () => {
    const d = donnees('2024-01-01', [
      {
        id: 5001,
        salarie_id: ID,
        jour: '2026-11-13',
        motif_id: JFR.id,
        epinglee: true,
      },
    ])
    const g = preparerGeneration(d, { aujourdhui: AUJOURDHUI })
    expect(g.probleme.salaries.find((s) => s.id === String(ID))?.jfr).toBeNull()
  })

  // Relecture du 2026-11-03 : une semaine type entièrement fixée (Travaille
  // du lundi au vendredi, Repos le week-end) n'avait jamais de jour où poser
  // le JFR, et le droit se perdait au bout de quatre semaines.
  function semaineFixee(d: DonneesSemaine): DonneesSemaine {
    return {
      ...d,
      referentiel: {
        ...d.referentiel,
        salaries: d.referentiel.salaries.map((x) =>
          x.id === ID
            ? {
                ...x,
                semaine_type: [0, 1, 2, 3, 4, 5, 6].map((j) =>
                  j < 5
                    ? { mode: 'travail' as const }
                    : { mode: 'repos' as const },
                ),
              }
            : x,
        ),
      },
    }
  }
  it('accepté : semaine type fixée, le JFR prend un jour « Travaille »', () => {
    const d = semaineFixee(donnees('2024-01-01'))
    const g = preparerGeneration(d, { aujourdhui: AUJOURDHUI, graine: 1 })
    const sol = g.probleme.salaries.find((s) => s.id === String(ID))!
    expect([...sol.jfr!.jours].sort()).toEqual([0, 1, 2, 3, 4])
    const r = generer(g.probleme, highs)
    const absences = g.absences(r)
    expect(absences).toHaveLength(1)
    expect(absences[0].jour).toBeLessThan(5)
    const shifts = g.traduire(r).filter((n) => n.salarie_id === ID)
    expect(shifts.map((n) => n.jour)).not.toContain(absences[0].jour)
    // Le jour habituel pris par le JFR n'est pas reproché.
    const semaine = analyser({
      ...d,
      absences: [
        ...d.absences,
        {
          id: 5003,
          salarie_id: ID,
          jour: ajouterJours(LUNDI, absences[0].jour),
          motif_id: JFR.id,
          epinglee: false,
        },
      ],
      affectations: poser(g.traduire(r)),
    })
    const b = semaine.bilan.find((x) => x.salarie_id === ID)!
    expect(b.alertes.map((a) => a.regle)).not.toContain('JOUR-HABITUEL')
    expect(b.alertes.map((a) => a.regle)).not.toContain('JOUR-FERIE')
  })
  it('refusé : jamais sur un repos fixe de la semaine type', () => {
    const d = semaineFixee(donnees('2024-01-01'))
    const g = preparerGeneration(d, { aujourdhui: AUJOURDHUI, graine: 1 })
    const sol = g.probleme.salaries.find((s) => s.id === String(ID))!
    expect(sol.jfr!.jours.has(5)).toBe(false)
    expect(sol.jfr!.jours.has(6)).toBe(false)
  })

  it('un JFR proposé est effacé et reproposé par la génération', () => {
    const d = donnees('2024-01-01', [
      {
        id: 5002,
        salarie_id: ID,
        jour: '2026-11-18',
        motif_id: JFR.id,
        epinglee: false,
      },
    ])
    const g = preparerGeneration(d, { aujourdhui: AUJOURDHUI })
    const sol = g.probleme.salaries.find((s) => s.id === String(ID))!
    expect(sol.jfr).not.toBeNull()
    expect(sol.indisponibilites.has(2)).toBe(false)
  })

  it('au-delà de quatre semaines, plus de proposition', () => {
    const d = donnees('2024-01-01')
    const tard = preparerGeneration(
      { ...d, lundi: '2026-12-14', avant: [], anterieures: d.avant },
      { aujourdhui: '2026-12-12' },
    )
    expect(
      tard.probleme.salaries.find((s) => s.id === String(ID))?.jfr,
    ).toBeNull()
  })

  // 39 h, journée étoile fixée le mardi, un jour libre (mode auto). Un JFR ce
  // jour-là rendrait l'étoile intravaillable : `heuresDues` baisserait de 7 h
  // et non des 8 h que vise le générateur.
  function avecEtoileMardi(d: DonneesSemaine): DonneesSemaine {
    return {
      ...d,
      referentiel: {
        ...d.referentiel,
        salaries: d.referentiel.salaries.map((x) =>
          x.id === ID
            ? {
                ...x,
                semaine_type: x.semaine_type.map((e, j) =>
                  j === 1 ? { mode: 'auto' as const, etoile: true } : e,
                ),
              }
            : x,
        ),
      },
    }
  }

  it('accepté : étoile fixée, le JFR évite son jour et la baisse concorde avec heuresDues', () => {
    const d = avecEtoileMardi(donnees('2024-01-01'))
    const ctx = contexte(d)
    const x = ctx.staff.find((s) => s.id === ID)!
    const f = fiche(x, LUNDI, ctx)
    expect(x.semaine_type[1]).toMatchObject({ etoile: true })
    const g = preparerGeneration(d, { aujourdhui: AUJOURDHUI, graine: 1 })
    const sol = g.probleme.salaries.find((s) => s.id === String(ID))!
    expect(sol.jfr).not.toBeNull()
    expect(sol.jfr!.reduction).toBe(8 * 60)
    expect(sol.jfr!.jours.has(1)).toBe(false)
    // Pour chaque jour permis, les heures dues avec le JFR posé ce jour-là
    // (vérificateur, affichage) égalent celles que vise le générateur.
    for (const j of sol.jfr!.jours) {
      const avecJfr: Fiche = {
        ...f,
        indisponibilites: new Set([...(f.indisponibilites ?? []), j]),
        joursAbsenceDecomptes: (f.joursAbsenceDecomptes ?? 0) + 1,
      }
      expect(heuresDues(avecJfr)).toBe(heuresDues(f) - sol.jfr!.reduction)
    }
  })

  it('refusé : un JFR posé le jour de l’étoile laisserait un écart', () => {
    const d = avecEtoileMardi(donnees('2024-01-01'))
    const ctx = contexte(d)
    const f = fiche(
      ctx.staff.find((s) => s.id === ID)!,
      LUNDI,
      ctx,
    )
    const leMardi: Fiche = {
      ...f,
      indisponibilites: new Set([...(f.indisponibilites ?? []), 1]),
      joursAbsenceDecomptes: (f.joursAbsenceDecomptes ?? 0) + 1,
    }
    expect(heuresDues(f) - heuresDues(leMardi)).not.toBe(reductionJourFerie(f))
  })

  it('la fiche et le contexte voient le motif JFR', () => {
    const ctx = contexte(donnees('2024-01-01'))
    expect([...ctx.motifsJfr]).toEqual([JFR.id])
    const x = ctx.staff.find((s) => s.id === ID)!
    expect(reductionJourFerie(fiche(x, LUNDI, ctx))).toBe(7 * 60)
  })
})

describe('le poids du JFR en attente', () => {
  // Deux places de 8 h du lundi au vendredi. A (39 h) a un JFR à prendre le
  // jeudi ; B (39 h) travaille ses 5 jours ; C dépanne. Le JFR de A laisse
  // une place du jeudi à C (un dépannage) : seul le poids du JFR en attente
  // le fait prendre quand même.
  const H = 60
  const base = {
    postes: new Set(['1']),
    minutesHebdoMax: 48 * H,
    minutesJourMax: 12 * H,
    joursTravaillesMaxSemaine: 6,
    reposQuotidienMin: 11 * H,
    joursPreferesSemaine: 5,
  }
  const creneaux = [0, 1, 2, 3, 4].map((j) =>
    creneau({
      id: `b${j}`,
      poste: '1',
      debut: j * 1440 + 8 * H,
      fin: j * 1440 + 16 * H,
      effectif: 2,
    }),
  )
  const probleme = (jfr: boolean) => ({
    salaries: [
      salarieSolveur({
        ...base,
        id: 'A',
        minutesHebdoContrat: 39 * H,
        jfr: jfr ? { jours: new Set([3]), reduction: 7 * H } : null,
      }),
      salarieSolveur({ ...base, id: 'B', minutesHebdoContrat: 39 * H }),
      salarieSolveur({
        ...base,
        id: 'C',
        minutesHebdoContrat: 0,
        contratIndicatif: true,
        postesOccasionnels: new Set(['1']),
      }),
    ],
    creneaux,
    nbJours: 7,
    tempsMaxSecondes: 10,
    graine: 0,
    imposees: new Set<string>(),
    aEviter: new Set<string>(),
    consignes: [],
  })

  it('accepté : le JFR est pris, la place passe en dépannage', () => {
    const r = generer(probleme(true), highs)
    expect(r.jfr).toEqual([{ salarieId: 'A', jour: 3 }])
    expect(r.affectations).toContainEqual({ salarieId: 'C', creneauId: 'b3' })
    expect(r.manques).toEqual([])
  })

  it('refusé : sans JFR à prendre, A tient sa place du jeudi', () => {
    const r = generer(probleme(false), highs)
    expect(r.jfr ?? []).toEqual([])
    expect(r.affectations).toContainEqual({ salarieId: 'A', creneauId: 'b3' })
  })
})

// Décisions utilisateur du 2026-11-02 : « les stagiaires ont tous leurs
// jours fériés » ; un mineur n'est pas placé un jour férié si on peut
// l'éviter (permis en hôtellerie par dérogation).
const JF: Motif = {
  id: 78,
  code: 'JF',
  nom: 'Jour férié',
  couleur: '#a78bfa',
  decompte: true,
  nature: 'absence',
}

function semaineDu11(
  modif: (x: DonneesSemaine['referentiel']['salaries'][number]) => void,
) {
  const demo = hotelDemo(AVANT)
  const salaries = demo.referentiel.salaries.map((x) => {
    if (x.id !== ID) return x
    const y = { ...x }
    modif(y)
    return y
  })
  const d: DonneesSemaine = {
    lundi: AVANT,
    referentiel: {
      ...demo.referentiel,
      salaries,
      motifs: [...demo.referentiel.motifs, JFR, JF],
    },
    absences: demo.absences,
    affectations: [],
    avant: [],
    apres: [],
  }
  return d
}

describe('stagiaires : tous leurs jours fériés', () => {
  it('accepté : le 11/11 est un jour férié pour le stagiaire, une journée de moins', () => {
    const d = semaineDu11((x) => {
      x.type_contrat = 'stagiaire'
      x.heures_hebdo = 35
    })
    const b = analyser(d).bilan.find((x) => x.salarie_id === ID)!
    expect(b.absences[2]).toBe(JF.id)
    expect(b.minutes_contrat).toBe(28 * 60)
    const g = preparerGeneration(d, { aujourdhui: '2026-11-01', graine: 1 })
    const r = generer(g.probleme, highs)
    expect(
      g
        .traduire(r)
        .filter((n) => n.salarie_id === ID)
        .map((n) => n.jour),
    ).not.toContain(2)
  })

  it('refusé : un salarié en CDI n’a pas ce jour férié d’office', () => {
    const d = semaineDu11(() => {})
    const b = analyser(d).bilan.find((x) => x.salarie_id === ID)!
    expect(2 in b.absences).toBe(false)
  })
})

describe('mineurs : pas de jour férié si on peut l’éviter', () => {
  it('accepté : un mineur n’est pas placé le 11/11, et l’alerte existe', () => {
    const d = semaineDu11((x) => {
      x.mineur = true
      x.heures_hebdo = 35
    })
    const g = preparerGeneration(d, { aujourdhui: '2026-11-01', graine: 1 })
    const sol = g.probleme.salaries.find((s) => s.id === String(ID))!
    expect([...sol.feriesEvites]).toEqual([2])
    const r = generer(g.probleme, highs)
    expect(
      g
        .traduire(r)
        .filter((n) => n.salarie_id === ID)
        .map((n) => n.jour),
    ).not.toContain(2)
    const c = creneau({
      id: 'f',
      poste: '1',
      debut: 2 * 1440 + 480,
      fin: 2 * 1440 + 900,
      jourPlanning: 2,
    })
    expect(violationsSalarie(sol, [c], 7).map((v) => v.regle)).toContain(
      'MINEUR-FERIE',
    )
  })

  it('refusé : un majeur n’a pas l’alerte', () => {
    const d = semaineDu11(() => {})
    const g = preparerGeneration(d, { aujourdhui: '2026-11-01', graine: 1 })
    const sol = g.probleme.salaries.find((s) => s.id === String(ID))!
    expect(sol.feriesEvites.size).toBe(0)
    const c = creneau({
      id: 'f',
      poste: '1',
      debut: 2 * 1440 + 480,
      fin: 2 * 1440 + 900,
      jourPlanning: 2,
    })
    expect(violationsSalarie(sol, [c], 7).map((v) => v.regle)).not.toContain(
      'MINEUR-FERIE',
    )
  })
})

describe('le poids d’un mineur un jour férié', () => {
  // A et B (39 h) se partagent du lundi au samedi : 2 places par jour, une
  // seule le jeudi (férié) et le samedi. L'un des deux travaille le jeudi,
  // l'autre le samedi : jamais le mineur le jeudi.
  const H = 60
  const base = {
    postes: new Set(['1']),
    minutesHebdoMax: 48 * H,
    minutesJourMax: 12 * H,
    joursTravaillesMaxSemaine: 6,
    reposQuotidienMin: 11 * H,
    joursPreferesSemaine: 5,
    minutesHebdoContrat: 40 * H,
  }
  const creneaux = [0, 1, 2, 3, 4, 5].map((j) =>
    creneau({
      id: `b${j}`,
      poste: '1',
      debut: j * 1440 + 8 * H,
      fin: j * 1440 + 16 * H,
      effectif: j === 3 || j === 5 ? 1 : 2,
    }),
  )
  const probleme = (mineur: 'A' | 'B') => ({
    salaries: ['A', 'B'].map((id) =>
      salarieSolveur({
        ...base,
        id,
        feriesEvites: id === mineur ? new Set([3]) : new Set<number>(),
      }),
    ),
    creneaux,
    nbJours: 7,
    tempsMaxSecondes: 10,
    graine: 0,
    imposees: new Set<string>(),
    aEviter: new Set<string>(),
    consignes: [],
  })

  it('accepté : A mineur, B tient le jeudi férié', () => {
    const r = generer(probleme('A'), highs)
    expect(r.affectations).toContainEqual({ salarieId: 'B', creneauId: 'b3' })
    expect(r.manques).toEqual([])
  })

  it('refusé : B mineur, c’est A qui tient le jeudi', () => {
    const r = generer(probleme('B'), highs)
    expect(r.affectations).toContainEqual({ salarieId: 'A', creneauId: 'b3' })
    expect(r.manques).toEqual([])
  })
})

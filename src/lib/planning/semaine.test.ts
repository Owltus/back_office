import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  cle,
  cleAEviter,
  creneau as creneauModele,
  probleme,
  salarieSolveur,
} from '#/lib/planning/modele.ts'
import type {
  AffectationSolveur,
  Creneau,
  Probleme,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import { estEcole, preparerGeneration } from '#/lib/planning/semaine.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import { hotelReel } from '#/lib/planning/test/hotelReel.ts'
import { PlanningMemoire } from '#/lib/planning/test/planningMemoire.ts'
import { ajouterJours, MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import type { Affectation, Salarie } from '#/lib/planning/types.ts'
import { violations } from '#/lib/planning/verificateur.ts'

/*
 * Port des tests du prototype qui passaient par l'API et SQLite
 * (`test_semaine_type.py`, `test_semi_auto.py`, `test_garde_fous.py`,
 * `test_fixes_backup.py`, `test_api.py`, `test_audit_api.py`), pour la part
 * dont la règle vit dans la logique pure (`semaine.ts` : analyser,
 * preparerGeneration, fiche ; `temps.ts`). Les données sont construites EN
 * MÉMOIRE (`PlanningMemoire`, qui rejoue les routes et les RPC d'écriture)
 * au lieu des appels HTTP. Valeurs attendues : celles du prototype.
 *
 * Jeux : l'hôtel fictif (`hotelDemo`, PLANNING_JEU=demo) et l'hôtel réel
 * (`hotelReel`, PLANNING_JEU=hotel, sous des pseudonymes). Le « lundi prochain » du jeu fictif est fixé au
 * 2026-11-02 ; la date du jour par défaut est celle du conftest (2026-09-01).
 */

const H = 60
const AUJOURDHUI = '2026-09-01'
const LUNDI = '2026-11-02'

let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const range = (a: number, b?: number) => {
  const [debut, fin] = b === undefined ? [0, a] : [a, b]
  return Array.from({ length: fin - debut }, (_, i) => debut + i)
}

function demo(aujourdhui = AUJOURDHUI): PlanningMemoire {
  const { referentiel, absences } = hotelDemo(LUNDI)
  return new PlanningMemoire(referentiel, absences, aujourdhui, highs)
}

function reel(aujourdhui = AUJOURDHUI): PlanningMemoire {
  const { referentiel, absences } = hotelReel()
  return new PlanningMemoire(referentiel, absences, aujourdhui, highs)
}

const bilanDe = (sem: SemaineOut, id: number) =>
  sem.bilan.find((b) => b.salarie_id === id)!
const siens = (sem: SemaineOut, id: number) =>
  sem.affectations.filter((a) => a.salarie_id === id)
const joursDe = (sem: SemaineOut, id: number) =>
  new Set(siens(sem, id).map((a) => a.jour))
const bon = (sem: SemaineOut) =>
  sem.stats.infractions === 0 && sem.stats.pourvues === sem.stats.places
const repartition = (sem: SemaineOut) =>
  new Set(
    sem.affectations
      .filter((a) => !a.epinglee)
      .map((a) => `${a.salarie_id}|${a.jour}|${a.poste_id}|${a.type_shift_id}`),
  )
const ecartTotal = (sem: SemaineOut) =>
  sem.bilan.reduce((t, b) => t + Math.abs(b.minutes - b.minutes_contrat), 0)
const aJoursFixesDans = (x: Salarie) =>
  x.semaine_type.some((e) => e.mode === 'travail' || e.mode === 'repos')

// =================================================== test_semaine_type.py

describe('compétences, semaine type et shifts épinglés (test_semaine_type.py)', () => {
  const creneau = (
    id: string,
    poste: string,
    jour: number,
    debutH: number,
    finH: number,
  ) =>
    creneauModele({
      id,
      poste,
      debut: jour * MINUTES_PAR_JOUR + debutH * H,
      fin: jour * MINUTES_PAR_JOUR + finH * H,
    })
  const receptionniste = (
    id: string,
    contratH = 35,
    kw: Partial<SalarieSolveur> = {},
  ) =>
    salarieSolveur({
      id,
      postes: new Set(['reception']),
      minutesHebdoContrat: contratH * H,
      minutesHebdoMax: 48 * H,
      minutesJourMax: 12 * H,
      joursTravaillesMaxSemaine: 5,
      reposQuotidienMin: 11 * H,
      ...kw,
    })
  const semaineReception = () =>
    range(7).flatMap((j) => [
      creneau(`matin-${j}`, 'reception', j, 7, 15),
      creneau(`soir-${j}`, 'reception', j, 15, 23),
    ])
  const aff = (s: string, c: string): AffectationSolveur => ({
    salarieId: s,
    creneauId: c,
    court: false,
  })
  const gen = (p: Probleme) => generer(p, highs)
  const paires = (p: Probleme) =>
    new Set(gen(p).affectations.map((a) => `${a.salarieId}|${a.creneauId}`))

  it('un profil soutien n’est jamais seul et ne compte pas dans l’effectif', () => {
    const creneaux = range(3).map((j) =>
      creneauModele({
        id: `rec-${j}`,
        poste: 'reception',
        debut: j * MINUTES_PAR_JOUR + 7 * H,
        fin: j * MINUTES_PAR_JOUR + 15 * H,
        effectif: 1,
        soutien: 1,
      }),
    )
    const stagiaire = receptionniste('stag', 35, {
      postes: new Set(),
      postesSoutien: new Set(['reception']),
    })
    const titulaire = receptionniste('tit', 35, {
      indisponibilites: new Set([1]),
    })
    const p = probleme({ salaries: [stagiaire, titulaire], creneaux })
    const r = gen(p)
    const pris = new Set(
      r.affectations.map((a) => `${a.salarieId}|${a.creneauId}`),
    )
    expect(pris.has('stag|rec-1')).toBe(false)
    expect(pris.has('stag|rec-0') && pris.has('stag|rec-2')).toBe(true)
    expect(r.manques.map((m) => m.creneauId)).toEqual(['rec-1'])
    expect(violations(p, r.affectations)).toEqual([])
    expect(
      new Set(violations(p, [aff('stag', 'rec-1')]).map((v) => v.regle)),
    ).toEqual(new Set(['SOUTIEN-SEUL']))
  })

  it('le dépannage n’est utilisé que si le titulaire manque', () => {
    const creneaux = [creneau('club-0', 'club', 0, 7, 15)]
    const club = receptionniste('club', 35, { postes: new Set(['club']) })
    const polyvalent = receptionniste('poly', 35, {
      postes: new Set(['club']),
      postesOccasionnels: new Set(['club']),
    })
    expect(
      gen(
        probleme({ salaries: [polyvalent, club], creneaux }),
      ).affectations.map((a) => a.salarieId),
    ).toEqual(['club'])
    expect(
      gen(probleme({ salaries: [polyvalent], creneaux })).affectations.map(
        (a) => a.salarieId,
      ),
    ).toEqual(['poly'])
  })

  it('repos fixe, horaire imposé et horaires autorisés', () => {
    const creneaux = semaineReception().map((c) => ({
      ...c,
      typeShift: c.id.includes('matin') ? 'M' : 'S',
    }))
    const perso = receptionniste('perso', 35, {
      reposFixes: new Set([5, 6]),
      shiftImpose: [[0, 'S']],
      shiftsAutorises: new Set(['M', 'S']),
    })
    const p = probleme({ salaries: [perso], creneaux })
    const r = gen(p)
    const pris = new Set(r.affectations.map((a) => a.creneauId))
    for (const c of ['matin-5', 'soir-5', 'matin-6', 'soir-6', 'matin-0'])
      expect(pris.has(c)).toBe(false)
    expect(violations(p, r.affectations)).toEqual([])
    expect(
      new Set(violations(p, [aff('perso', 'matin-5')]).map((v) => v.regle)),
    ).toEqual(new Set(['REPOS-FIXE']))
  })

  it('un jour de travail habituel est préféré', () => {
    const creneaux = [
      creneau('j-1', 'reception', 1, 9, 17),
      creneau('j-3', 'reception', 3, 9, 17),
    ]
    for (const graine of range(3)) {
      const p = probleme({
        salaries: [
          receptionniste('autre', 8),
          receptionniste('h', 8, { travailFixe: new Set([3]) }),
        ],
        creneaux,
        graine,
      })
      expect(paires(p)).toEqual(new Set(['autre|j-1', 'h|j-3']))
    }
  })

  it('un shift épinglé est gardé même s’il enfreint une règle', () => {
    const creneaux: Creneau[] = [
      creneau('soir-0', 'reception', 0, 15, 23),
      creneau('matin-1', 'reception', 1, 7, 15),
    ]
    const p = probleme({
      salaries: [receptionniste('r0'), receptionniste('r1')],
      creneaux,
      imposees: new Set([cle('r0', 'soir-0'), cle('r0', 'matin-1')]),
    })
    const r = gen(p)
    expect(
      new Set(r.affectations.map((a) => `${a.salarieId}|${a.creneauId}`)),
    ).toEqual(new Set(['r0|soir-0', 'r0|matin-1']))
    expect(new Set(violations(p, r.affectations).map((v) => v.regle))).toEqual(
      new Set(['R-REPOS-QUOTIDIEN']),
    )
  })
})

// ===================================================== test_semi_auto.py

describe('semi-auto (test_semi_auto.py, hôtel réel)', () => {
  it('on ne génère pas le passé', () => {
    const p = reel('2026-10-27')
    // Semaine terminée : plus aucun jour à créer (le refus 409 est en base, PL409).
    const g = preparerGeneration(p.donnees('2026-10-19'), {
      aujourdhui: '2026-10-27',
    })
    expect(g.depuis).toBe(7)
    expect(g.traduire(generer(g.probleme, highs))).toEqual([])
    // Semaine en cours : le lundi 26 (passé) garde son shift et ne reçoit rien.
    const clara = p.salarie('Clara')
    const rec = clara.competences[0].poste_id
    p.poser('2026-10-26', clara.id, rec, 0, {
      debut: '07:00',
      fin: '15:45',
      epinglee: false,
    })
    const sem = p.generer('2026-10-26')
    expect(
      sem.affectations.filter((a) => a.jour === 0).map((a) => a.salarie_id),
    ).toEqual([clara.id])
    expect(sem.affectations.some((a) => a.jour >= 1)).toBe(true)
    expect(p.generer('2026-11-02').affectations.length).toBeGreaterThan(0)
  })

  it('les horaires fixes sont toujours posés', () => {
    const p = reel('2026-10-27')
    const tech = p.salarie('Paul')
    p.absent(tech.id, '2026-11-04', '2026-11-04', 'CP')
    const fixes = new Set(
      p.referentiel.salaries.filter(aJoursFixesDans).map((x) => x.id),
    )
    const sem = p.fixes('2026-11-02')
    expect(new Set(sem.affectations.map((a) => a.salarie_id))).toEqual(fixes)
    expect(
      sem.affectations.some((a) => a.salarie_id === tech.id && a.jour === 2),
    ).toBe(false)
    expect(p.fixes('2026-11-02').affectations).toEqual(sem.affectations)
    expect(p.fixes('2026-10-19').affectations).toEqual([])
    const complete = p.generer('2026-11-02')
    expect(complete.stats.infractions).toBe(0)
    expect(complete.stats.pourvues).toBe(complete.stats.places)
  })

  it('le week-end entre deux semaines d’école est un repos', () => {
    const p = reel('2026-10-27')
    const eleve = p.salarie('Élise').id
    const bilan = (lundi: string) => bilanDe(p.analyser(lundi), eleve)
    const r16 = new Set(bilan('2026-11-16').repos_fixes)
    expect(r16.has(5) && r16.has(6)).toBe(true)
    const r23 = new Set(bilan('2026-11-23').repos_fixes)
    expect(r23.has(5) || r23.has(6)).toBe(false)
    const sem = p.generer('2026-11-16')
    expect(sem.affectations.some((a) => a.salarie_id === eleve)).toBe(false)
  })
})

// ==================================================== test_fixes_backup.py

describe('horaires fixes puis « Compléter » (test_fixes_backup.py, hôtel réel)', () => {
  it('les fixes sur leur poste, puis renfort à la génération', () => {
    const p = reel('2026-10-27')
    const postes = new Map(p.referentiel.postes.map((x) => [x.id, x.nom]))
    const adjointes = new Set([p.salarie('Alice').id, p.salarie('Laure').id])

    let sem = p.fixes('2026-11-02')
    const desAdjointes = sem.affectations.filter((a) =>
      adjointes.has(a.salarie_id),
    )
    expect(desAdjointes.length).toBeGreaterThan(0)
    expect(new Set(desAdjointes.map((a) => postes.get(a.poste_id)))).toEqual(
      new Set(['Adjoint de direction']),
    )
    expect(sem.affectations.every((a) => a.role !== 'occasionnel')).toBe(true)

    for (const prenom of ['Clara', 'Agathe', 'Lise']) {
      p.absent(p.salarie(prenom).id, '2026-11-02', '2026-11-08', 'CP')
    }
    sem = p.generer('2026-11-02')
    const renforts = sem.affectations.filter(
      (a) =>
        adjointes.has(a.salarie_id) &&
        ['Réception', 'Club'].includes(postes.get(a.poste_id)!),
    )
    expect(renforts.length).toBeGreaterThan(0)
    for (const prenom of ['Alice', 'Laure']) {
      const x = p.salarie(prenom)
      const travail = new Set(
        range(7).filter((j) => x.semaine_type[j].mode === 'travail'),
      )
      for (const j of joursDe(sem, x.id))
        expect([prenom, travail.has(j)]).toEqual([prenom, true])
    }
    expect(sem.stats.infractions).toBe(0)
  })
})

// ===================================================== test_garde_fous.py

describe('garde-fous (test_garde_fous.py)', () => {
  const motif = (
    nature: 'absence' | 'ecole' = 'absence',
    code = 'ZZ',
    nom = 'Motif',
  ) => ({
    nature,
    code,
    nom,
  })

  it('école par nature, ou par repli sur le code et le nom', () => {
    expect(estEcole(motif('ecole'))).toBe(true)
    expect(estEcole(motif('absence'))).toBe(false)
    expect(estEcole(motif('absence', 'EC'))).toBe(true)
    expect(estEcole(motif('absence', 'ZZ', 'École du soir'))).toBe(true)
    expect(estEcole(motif('absence', 'SS', 'Sans solde'))).toBe(false)
  })

  it.each([
    ['ecole', [5, 6]],
    ['absence', []],
  ] as const)(
    'le week-end entre deux semaines « %s » : repos %j',
    (nature, repos) => {
      const p = demo()
      const id = Math.max(...p.referentiel.motifs.map((m) => m.id)) + 1
      p.referentiel.motifs.push({
        id,
        code: 'ZQ',
        nom: 'Hors hôtel',
        couleur: '#000000',
        decompte: true,
        nature,
      })
      const x = p.referentiel.salaries.find(
        (s) => !s.semaine_type.some((e) => e.mode === 'repos'),
      )!
      p.absent(x.id, '2026-11-16', '2026-11-20', 'ZQ')
      p.absent(x.id, '2026-11-23', '2026-11-27', 'ZQ')
      const fixes = new Set(bilanDe(p.analyser('2026-11-16'), x.id).repos_fixes)
      expect([5, 6].filter((j) => fixes.has(j))).toEqual(repos)
    },
  )

  it('deux « Compléter » de suite donnent deux plannings', () => {
    const p = reel('2026-10-27')
    p.fixes(LUNDI)
    const premier = p.generer(LUNDI)
    const second = p.generer(LUNDI)
    expect(bon(premier) && bon(second)).toBe(true)
    const communs = [...repartition(premier)].filter((k) =>
      repartition(second).has(k),
    )
    expect(communs.length).toBeLessThanOrEqual(
      Math.floor(repartition(premier).size / 2),
    )
    expect(second.stats.pourvues).toBe(premier.stats.pourvues)
    expect(ecartTotal(second)).toBeLessThanOrEqual(ecartTotal(premier))

    const valide = second.affectations.find((a) => !a.epinglee)!
    p.valider(LUNDI, { salarie: valide.salarie_id, jour: valide.jour })
    const epinglees = (sem: SemaineOut) =>
      new Set(
        sem.affectations
          .filter((a) => a.epinglee)
          .map((a) => `${a.salarie_id}|${a.jour}|${a.debut}|${a.fin}`),
      )
    const avant = epinglees(p.analyser(LUNDI))
    expect(
      avant.has(
        `${valide.salarie_id}|${valide.jour}|${valide.debut}|${valide.fin}`,
      ),
    ).toBe(true)
    const troisieme = p.generer(LUNDI)
    expect(bon(troisieme)).toBe(true)
    expect(epinglees(troisieme)).toEqual(avant)
  })

  it('deux graines donnent deux plannings', () => {
    const p = reel('2026-10-27')
    const resultats: SemaineOut[] = []
    for (const graine of [1, 2]) {
      // Sans historique : propositions effacées, validés gardés.
      p.semaines.set(
        LUNDI,
        p.shifts(LUNDI).filter((a) => a.epinglee),
      )
      const sem = p.generer(LUNDI, { graine })
      expect(bon(sem)).toBe(true)
      resultats.push(sem)
    }
    expect(repartition(resultats[0])).not.toEqual(repartition(resultats[1]))
    expect(ecartTotal(resultats[0])).toBe(ecartTotal(resultats[1]))
  })

  const receptionniste = (id: string, contratH = 8) =>
    salarieSolveur({
      id,
      postes: new Set(['rec']),
      minutesHebdoContrat: contratH * 60,
      minutesHebdoMax: 48 * 60,
      minutesJourMax: 12 * 60,
      joursTravaillesMaxSemaine: 5,
      reposQuotidienMin: 11 * 60,
    })
  const MATIN = creneauModele({
    id: 'm',
    poste: 'rec',
    debut: 7 * 60,
    fin: 15 * 60,
  })
  const qui = (p: Probleme) =>
    new Set(generer(p, highs).affectations.map((a) => a.salarieId))

  it.each(['r0', 'r1'])(
    'le solveur évite la proposition précédente (%s)',
    (deja) => {
      const autre = deja === 'r0' ? 'r1' : 'r0'
      const p = probleme({
        salaries: [receptionniste('r0'), receptionniste('r1')],
        creneaux: [MATIN],
        aEviter: new Set([cleAEviter(deja, 0, 'rec', null)]),
      })
      expect(qui(p)).toEqual(new Set([autre]))
      for (const k of [
        cleAEviter(deja, 1, 'rec', null),
        cleAEviter(deja, 0, 'club', null),
        cleAEviter(deja, 0, 'rec', 'M'),
      ]) {
        const evite = probleme({
          salaries: [receptionniste(deja)],
          creneaux: [MATIN],
          aEviter: new Set([k]),
        })
        expect(qui(evite)).toEqual(new Set([deja]))
      }
    },
  )

  it('éviter ne passe ni devant la couverture, ni les imposés, ni le contrat', () => {
    const k = new Set([cleAEviter('r0', 0, 'rec', null)])
    expect(
      qui(
        probleme({
          salaries: [receptionniste('r0')],
          creneaux: [MATIN],
          aEviter: k,
        }),
      ),
    ).toEqual(new Set(['r0']))
    const impose = probleme({
      salaries: [receptionniste('r0'), receptionniste('r1')],
      creneaux: [MATIN],
      aEviter: k,
      imposees: new Set([cle('r0', 'm')]),
    })
    expect(qui(impose)).toEqual(new Set(['r0']))
    const contrat = probleme({
      salaries: [receptionniste('r0'), receptionniste('r1', 0)],
      creneaux: [MATIN],
      aEviter: k,
    })
    expect(qui(contrat)).toEqual(new Set(['r0']))
  })

  it('après cinq jours d’école, le week-end est un repos', () => {
    const lundi = '2026-11-09'
    const p = demo()
    const avecAbsence = new Set(p.absences.map((a) => a.salarie_id))
    const staff = p.referentiel.salaries.filter(
      (x) =>
        !x.semaine_type.some((e) =>
          ['repos', 'travail', 'absence'].includes(e.mode),
        ) &&
        x.type_contrat !== 'extra' &&
        !avecAbsence.has(x.id),
    )
    const [eleve, temoin] = staff
    p.absent(eleve.id, '2026-11-09', '2026-11-13', 'EC')
    let sem = p.analyser(lundi)
    expect(bilanDe(sem, eleve.id).repos_deduits).toEqual([5, 6])
    expect(bilanDe(sem, temoin.id).repos_deduits).toEqual([])
    sem = p.generer(lundi)
    expect(siens(sem, eleve.id)).toEqual([])
    expect(bilanDe(sem, eleve.id).repos_deduits).toEqual([5, 6])
    const joursTemoin = joursDe(sem, temoin.id)
    expect(joursTemoin.size).toBeGreaterThanOrEqual(5)
    expect(bilanDe(sem, temoin.id).repos_deduits).toEqual(
      range(7).filter((j) => !joursTemoin.has(j)),
    )
  })
})

// ============================================================ test_api.py

describe('planning de la semaine (test_api.py)', () => {
  it('génération de la semaine de démo', () => {
    const p = demo()
    const sem = p.generer(LUNDI)
    expect(sem.stats.infractions).toBe(0)
    expect(sem.stats.pourvues).toBe(sem.stats.places)
    const chloe = p.salarie('Chloé').id
    const ines = p.salarie('Inès').id
    expect(
      sem.affectations.some((a) => a.salarie_id === chloe && a.jour < 5),
    ).toBe(false)
    const ecole = p.motif('EC')
    expect(bilanDe(sem, chloe).absences).toEqual(
      Object.fromEntries(range(5).map((j) => [j, ecole])),
    )
    expect(siens(sem, ines).length).toBeGreaterThan(0)
    const lea = siens(sem, p.salarie('Léa').id)
    expect(lea.length).toBeGreaterThan(0)
    expect(lea.every((a) => a.role === 'soutien')).toBe(true)
  })

  it('un shift déplacé est épinglé et la régénération le garde', () => {
    const p = demo()
    let sem = p.generer(LUNDI)
    const karim = p.salarie('Karim').id
    const nuit = siens(sem, karim)[0]
    const lucas = p.salarie('Lucas').id
    // Retouche (RPC planning_modifier_shift) : toute retouche épingle.
    p.semaines.set(
      LUNDI,
      p
        .shifts(LUNDI)
        .map((a) =>
          a.id === nuit.id ? { ...a, salarie_id: lucas, epinglee: true } : a,
        ),
    )
    sem = p.analyser(LUNDI)
    const deplace = sem.affectations.find((a) => a.id === nuit.id)!
    expect(deplace.epinglee && deplace.salarie_id === lucas).toBe(true)
    expect(deplace.alertes.map((x) => x.regle)).toContain('POSTE')
    sem = p.generer(LUNDI, { graine: 2 })
    expect(sem.affectations.some((a) => a.id === nuit.id)).toBe(true)
    sem = p.generer(LUNDI, { tout: true })
    expect(
      sem.affectations.some(
        (a) => a.salarie_id === lucas && a.poste_id === nuit.poste_id,
      ),
    ).toBe(false)
  })

  it('scénario sans les apprentis et stagiaires', () => {
    const p = demo()
    const exclus = new Set([p.salarie('Léa').id, p.salarie('Chloé').id])
    const sem = p.generer(LUNDI, { exclus })
    expect(sem.affectations.some((a) => exclus.has(a.salarie_id))).toBe(false)
    expect(sem.stats.infractions).toBe(0)
  })

  it('ajout manuel d’un besoin et d’un code horaire', () => {
    const p = demo()
    const ref = p.referentiel
    const horaire = {
      id: 100,
      code: 'C',
      nom: 'Coupure',
      debut: '10:00',
      fin: '14:00',
      couleur: '#000000',
      pause: 0,
      raccourci: 0,
      raccourci_debut: 0,
    }
    ref.horaires.push(horaire)
    const poste = {
      id: 100,
      nom: 'Spa',
      categorie: 'autre' as const,
      couleur: '#000000',
      horaires_autorises: [],
      a_part: false,
    }
    ref.postes.push(poste)
    ref.besoins.push({
      id: 1000,
      poste_id: poste.id,
      jour: 0,
      horaire_id: horaire.id,
      debut: '10:00',
      fin: '14:00',
      effectif: 1,
      soutien: 1,
      renfort: 0,
    })
    let sem = p.analyser(LUNDI)
    const trou = sem.a_pourvoir.find((t) => t.poste_id === poste.id)!
    expect([trou.debut, trou.fin, trou.raisons]).toEqual(['10:00', '14:00', []])
    sem = p.poser(LUNDI, p.salarie('Nadia').id, poste.id, 0, { code: 'C' })
    expect(sem.a_pourvoir.some((t) => t.poste_id === poste.id)).toBe(false)
  })

  it('jours de repos variables, sauf les jours fixes', () => {
    const p = demo()
    const jours: Array<Map<number, Set<number>>> = []
    for (const decalage of [0, 7, 14]) {
      const sem = p.generer(ajouterJours(LUNDI, decalage))
      expect(sem.stats.infractions).toBe(0)
      const travail = new Map<number, Set<number>>()
      for (const a of sem.affectations)
        travail.set(
          a.salarie_id,
          (travail.get(a.salarie_id) ?? new Set()).add(a.jour),
        )
      jours.push(travail)
    }
    const claire = p.salarie('Claire').id
    for (const j of jours)
      expect(j.get(claire)).toEqual(new Set([0, 1, 2, 3, 4]))
    const hoteliers = ['Lucas', 'Nadia', 'Emma'].map((x) => p.salarie(x).id)
    const signature = (s: Set<number> | undefined) =>
      [...(s ?? [])].sort().join(',')
    expect(
      hoteliers.some(
        (h) => new Set(jours.map((j) => signature(j.get(h)))).size > 1,
      ),
    ).toBe(true)
  })

  it('les hôteliers à 39 h ont un jour court', () => {
    const p = demo()
    let sem = p.generer(LUNDI)
    const lucas = p.salarie('Lucas').id
    const bilan = bilanDe(sem, lucas)
    expect(bilan.minutes).toBe(39 * 60)
    expect(bilan.minutes_contrat).toBe(39 * 60)
    const courts = siens(sem, lucas).filter((a) => a.court)
    expect(courts.length).toBe(1)
    expect(courts[0].duree).toBe(7 * 60)
    expect(courts[0].pause).toBe(45)
    p.semaines.set(
      LUNDI,
      p
        .shifts(LUNDI)
        .map((a) => (a.id === courts[0].id ? { ...a, epinglee: true } : a)),
    )
    sem = p.generer(LUNDI, { graine: 3 })
    const garde = sem.affectations.find((a) => a.id === courts[0].id)!
    expect(garde.court).toBe(true)
    expect(garde.fin).toBe(courts[0].fin)
    expect(sem.stats.pourvues).toBe(sem.stats.places)
  })

  it('le middle n’est jamais à pourvoir', () => {
    const p = demo()
    const middle = p.horaire('MI').id
    const exclus = new Set(
      p.referentiel.salaries
        .filter((s) => s.prenom !== 'Karim')
        .map((s) => s.id),
    )
    const sem = p.generer(LUNDI, { exclus })
    expect(sem.a_pourvoir.length).toBeGreaterThan(0)
    expect(sem.a_pourvoir.every((t) => t.type_shift_id !== middle)).toBe(true)
    expect(sem.stats.places).toBe(35)
  })

  it('une absence posée depuis le planning apparaît au bilan, jour par jour', () => {
    const p = demo()
    let sem = p.generer(LUNDI)
    const lucas = p.salarie('Lucas').id
    const jour = siens(sem, lucas)[0].jour
    const rtt = 100
    p.referentiel.motifs.push({
      id: rtt,
      code: 'RTT',
      nom: 'RTT',
      couleur: '#000000',
      decompte: true,
      nature: 'absence',
    })
    for (const j of [jour, (jour + 1) % 7, (jour + 2) % 7]) {
      const d = ajouterJours(LUNDI, j)
      p.absent(lucas, d, d, 'RTT')
    }
    sem = p.analyser(LUNDI)
    expect(bilanDe(sem, lucas).absences[jour]).toBe(rtt)
    p.absences = p.absences.filter(
      (a) => !(a.salarie_id === lucas && a.jour === ajouterJours(LUNDI, jour)),
    )
    const absences = bilanDe(p.analyser(LUNDI), lucas).absences
    expect(jour in absences).toBe(false)
    expect(Object.keys(absences).length).toBe(2)
  })

  it('horaires possibles par poste', () => {
    const p = demo()
    const direction = p.referentiel.postes.find((x) => x.nom === 'Direction')!
    expect(direction.horaires_autorises).toEqual([p.horaire('D').id])
    const nuit = p.horaire('N')
    p.referentiel.besoins.push({
      id: 1000,
      poste_id: direction.id,
      jour: 0,
      horaire_id: nuit.id,
      debut: nuit.debut,
      fin: nuit.fin,
      effectif: 1,
      soutien: 1,
      renfort: 0,
    })
    let sem = p.generer(LUNDI)
    expect(
      sem.alertes_besoins.some((a) => a.message.includes('pas prévu')),
    ).toBe(true)
    expect(
      sem.affectations.some(
        (a) => a.poste_id === direction.id && a.type_shift_id === nuit.id,
      ),
    ).toBe(false)
    const claire = p.salarie('Claire').id
    sem = p.poser(LUNDI, claire, direction.id, 5, { code: 'N' })
    const carte = sem.affectations.find(
      (a) => a.type_shift_id === nuit.id && a.salarie_id === claire,
    )!
    expect(carte.alertes.map((x) => x.regle)).toContain('HORAIRE-POSTE')
  })

  it('horaires de la fiche : jamais le matin, nuits du week-end', () => {
    const p = demo()
    const lucas = p.salarie('Lucas')
    lucas.shifts_autorises = [p.horaire('MI').id, p.horaire('AM').id]
    const yannis = p.salarie('Yannis')
    yannis.heures_hebdo = 24
    yannis.semaine_type = range(7).map((j) => ({
      mode: 'auto' as const,
      type_absence_id: null,
      type_shift_id: j < 5 ? p.horaire('AM').id : p.horaire('N').id,
    }))
    const sem = p.generer(LUNDI)
    expect(sem.stats.infractions).toBe(0)
    expect(siens(sem, lucas.id).length).toBeGreaterThan(0)
    expect(
      siens(sem, lucas.id).every((a) => a.type_shift_id !== p.horaire('M').id),
    ).toBe(true)
    expect(siens(sem, yannis.id).length).toBeGreaterThan(0)
    for (const a of siens(sem, yannis.id)) {
      expect(a.type_shift_id).toBe(
        a.jour < 5 ? p.horaire('AM').id : p.horaire('N').id,
      )
    }
  })

  it('les plannings fixes sont placés d’office', () => {
    const p = demo()
    const sem = p.generer(LUNDI)
    expect(sem.stats.infractions).toBe(0)
    const semaineDe = (prenom: string) =>
      Object.fromEntries(
        siens(sem, p.salarie(prenom).id).map((a) => [a.jour, [a.debut, a.fin]]),
      )
    expect(semaineDe('Claire')).toEqual(
      Object.fromEntries(range(5).map((j) => [j, ['08:00', '18:00']])),
    )
    expect(semaineDe('Marc')).toEqual({
      ...Object.fromEntries(range(4).map((j) => [j, ['08:00', '16:45']])),
      4: ['08:00', '15:45'],
    })
    const thomas = semaineDe('Thomas')
    expect(new Set(Object.keys(thomas).map(Number))).toEqual(
      new Set([1, 2, 3, 4, 5]),
    )
    expect(Object.values(thomas).every(([debut]) => debut === '15:00')).toBe(
      true,
    )
    const yannis = semaineDe('Yannis')
    expect(new Set(Object.keys(yannis).map(Number))).toEqual(
      new Set([1, 2, 3, 4, 5]),
    )
    expect([1, 2, 3].every((j) => yannis[j][0] === '15:00')).toBe(true)
    expect([4, 5].every((j) => yannis[j][0] === '23:00')).toBe(true)
    const forfait = new Set(
      p.referentiel.salaries.filter((x) => x.forfait_jours).map((x) => x.id),
    )
    for (const b of sem.bilan) {
      if (!forfait.has(b.salarie_id) && Object.keys(b.absences).length < 7) {
        expect([b.salarie_id, b.minutes]).toEqual([
          b.salarie_id,
          b.minutes_contrat,
        ])
      }
    }
    expect(
      siens(sem, p.salarie('Yannis').id).filter((a) => a.court).length,
    ).toBe(1)
  })

  it('11 h de repos d’une semaine à l’autre', () => {
    const p = demo()
    const services = new Map<number, Array<[number, number]>>()
    const enMinutes = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number)
      return h * 60 + m
    }
    for (let k = 0; k < 3; k++) {
      const sem = p.generer(ajouterJours(LUNDI, 7 * k))
      expect(sem.stats.infractions).toBe(0)
      for (const a of sem.affectations) {
        const debut = (7 * k + a.jour) * 1440 + enMinutes(a.debut)
        let fin = (7 * k + a.jour) * 1440 + enMinutes(a.fin)
        if (fin <= debut) fin += 1440
        services.set(a.salarie_id, [
          ...(services.get(a.salarie_id) ?? []),
          [debut, fin],
        ])
      }
    }
    for (const liste of services.values()) {
      liste.sort((a, b) => a[0] - b[0] || a[1] - b[1])
      for (let i = 0; i + 1 < liste.length; i++) {
        expect(liste[i + 1][0] - liste[i][1]).toBeGreaterThanOrEqual(11 * 60)
      }
    }
  })

  it('deux apprenties en alternance décalée', () => {
    const p = demo()
    const chloe = p.salarie('Chloé').id
    const ines = p.salarie('Inès').id
    const aLEcole: string[] = []
    for (let k = 0; k < 6; k++) {
      const sem = p.generer(ajouterJours(LUNDI, 7 * k))
      expect(sem.stats.infractions).toBe(0)
      const enSemaine = new Set(
        sem.affectations.filter((a) => a.jour < 5).map((a) => a.salarie_id),
      )
      const presentes = [chloe, ines].filter((x) => enSemaine.has(x))
      const ecole = new Set(
        sem.bilan
          .filter((b) => Object.keys(b.absences).length === 5)
          .map((b) => b.salarie_id),
      )
      expect(presentes.length).toBe(1)
      expect(presentes.some((x) => ecole.has(x))).toBe(false)
      aLEcole.push(ecole.has(chloe) ? 'Chloé' : 'Inès')
    }
    expect(aLEcole).toEqual([
      'Chloé',
      'Chloé',
      'Inès',
      'Inès',
      'Chloé',
      'Chloé',
    ])
  })

  it('valider puis régénérer le reste (semi-auto)', () => {
    const p = demo()
    let sem = p.generer(LUNDI)
    expect(sem.affectations.some((a) => a.epinglee)).toBe(false)
    const lucas = p.salarie('Lucas').id
    p.valider(LUNDI, { jour: 2 })
    sem = p.valider(LUNDI, { salarie: lucas })
    const cleDe = (a: { salarie_id: number; jour: number; debut: string }) =>
      `${a.salarie_id}|${a.jour}|${a.debut}`
    const valides = new Set(
      sem.affectations.filter((a) => a.epinglee).map(cleDe),
    )
    expect(valides).toEqual(
      new Set(
        sem.affectations
          .filter((a) => a.jour === 2 || a.salarie_id === lucas)
          .map(cleDe),
      ),
    )
    for (const graine of [1, 2, 3]) {
      const nouvelle = new Set(
        p.generer(LUNDI, { graine }).affectations.map(cleDe),
      )
      for (const v of valides) expect(nouvelle.has(v)).toBe(true)
    }
    sem = p.valider(LUNDI, { epinglee: false })
    expect(sem.affectations.some((a) => a.epinglee)).toBe(false)
  })

  it('fin de contrat et arrivée', () => {
    const p = demo()
    const lucas = p.salarie('Lucas')
    const nadia = p.salarie('Nadia')
    lucas.date_sortie = ajouterJours(LUNDI, 2)
    nadia.date_entree = ajouterJours(LUNDI, 3)
    let sem = p.generer(LUNDI)
    expect(sem.stats.infractions).toBe(0)
    for (const j of joursDe(sem, lucas.id)) expect([0, 1, 2]).toContain(j)
    for (const j of joursDe(sem, nadia.id)) expect([3, 4, 5, 6]).toContain(j)
    expect(bilanDe(sem, lucas.id).hors_contrat).toEqual([3, 4, 5, 6])
    expect(bilanDe(sem, lucas.id).minutes_contrat).toBeLessThan(39 * 60)
    sem = p.poser(LUNDI, lucas.id, lucas.competences[0].poste_id, 5, {
      debut: '07:00',
      fin: '15:00',
    })
    const alertes = siens(sem, lucas.id)
      .filter((a) => a.jour === 5)
      .flatMap((a) => a.alertes.map((x) => x.regle))
    expect(alertes).toContain('HORS-CONTRAT')
  })

  it('vrai hôtel : semaine relevée (S42) puis semaine neuve', () => {
    const p = reel()
    const yohan = p.salarie('Yohan').id
    const tech = p.salarie('Paul').id
    const jeanne = p.salarie('Jeanne').id
    // Les quelques shifts de la S42 utiles ici, tels que le chargeur les pose.
    const S42 = '2026-10-12'
    p.absent(tech, S42, ajouterJours(S42, 4), 'CP')
    p.poser(S42, yohan, p.poste('Veille de nuit'), 6, {
      code: 'N',
      court: true,
    })
    p.poser(S42, jeanne, p.poste('Direction'), 0, {
      debut: '08:00',
      fin: '17:30',
      pause: 15,
    })
    const s42 = p.analyser(S42)
    const bilanTech = bilanDe(s42, tech)
    expect(new Set(Object.keys(bilanTech.absences))).toEqual(
      new Set(['0', '1', '2', '3', '4']),
    )
    expect(bilanTech.alertes).toEqual([])
    const nuit = siens(s42, yohan).find((a) => a.jour === 6)!
    expect([nuit.debut, nuit.fin, nuit.duree]).toEqual([
      '24:00',
      '07:00',
      7 * 60,
    ])
    expect(siens(s42, jeanne).find((a) => a.jour === 0)!.duree).toBe(
      9 * 60 + 15,
    )

    const sem = p.generer('2026-11-02')
    expect(sem.stats.infractions).toBe(0)
    expect(sem.stats.pourvues).toBe(sem.stats.places)
    const fiches = new Map(p.referentiel.salaries.map((x) => [x.id, x]))
    for (const b of sem.bilan) {
      const x = fiches.get(b.salarie_id)!
      if (
        x.forfait_jours ||
        x.type_contrat === 'extra' ||
        Object.keys(b.absences).length
      )
        continue
      expect([x.prenom, b.minutes]).toEqual([x.prenom, b.minutes_contrat])
      if (x.heures_hebdo > 35) {
        expect([
          x.prenom,
          siens(sem, x.id).filter((a) => a.duree < 8 * 60).length,
        ]).toEqual([x.prenom, 1])
      }
    }
    const shift = (qui: number, jour: number) =>
      sem.affectations.find((a) => a.salarie_id === qui && a.jour === jour)!
    expect([
      shift(tech, 4).debut,
      shift(tech, 4).fin,
      shift(tech, 4).court,
    ]).toEqual(['08:00', '15:45', true])
    expect([shift(yohan, 6).debut, shift(yohan, 6).fin]).toEqual([
      '24:00',
      '07:00',
    ])
    const bilanYohan = bilanDe(sem, yohan)
    expect(bilanYohan.minutes).toBe(39 * 60)
    expect(bilanYohan.alertes).toEqual([])
    const extras = new Set([p.salarie('Max').id, p.salarie('Louna').id])
    expect(sem.affectations.some((a) => extras.has(a.salarie_id))).toBe(false)
  }, 30_000)

  it('vrai hôtel : apprenties en alternance', () => {
    const p = reel()
    const lou = p.salarie('Lou').id
    const elise = p.salarie('Élise').id
    const aLEcole: string[] = []
    for (let k = 0; k < 8; k++) {
      const sem = p.generer(ajouterJours('2026-10-19', 7 * k))
      expect(sem.stats.infractions).toBe(0)
      const ecole = new Set(
        sem.bilan
          .filter((b) => Object.keys(b.absences).length === 5)
          .map((b) => b.salarie_id),
      )
      const enSemaine = new Set(
        sem.affectations.filter((a) => a.jour < 5).map((a) => a.salarie_id),
      )
      const presentes = [lou, elise].filter((x) => enSemaine.has(x))
      expect([lou, elise].filter((x) => ecole.has(x)).length).toBe(1)
      expect(presentes.some((x) => ecole.has(x))).toBe(false)
      aLEcole.push(ecole.has(elise) ? 'Élise' : 'Lou')
    }
    expect(aLEcole).toEqual([
      'Élise',
      'Élise',
      'Lou',
      'Lou',
      'Élise',
      'Élise',
      'Lou',
      'Lou',
    ])
  }, 30_000)

  it('vrai hôtel : vacances et heures dues', () => {
    const p = reel()
    const fixes = new Set(
      p.referentiel.salaries
        .filter((x) => x.semaine_type.some((e) => e.mode !== 'auto'))
        .map((x) => x.prenom),
    )
    expect(fixes).toEqual(
      new Set(['Jeanne', 'Alice', 'Laure', 'Paul', 'Théo', 'Yves', 'Yohan']),
    )
    const clara = p.salarie('Clara').id
    const agathe = p.salarie('Agathe').id
    p.absent(clara, '2026-11-16', '2026-11-29', 'CP')
    p.absent(agathe, '2026-11-18', '2026-11-18', 'CP')
    for (const lundi of ['2026-11-16', '2026-11-23']) {
      const sem = p.generer(lundi)
      expect(sem.stats.infractions).toBe(0)
      const b = bilanDe(sem, clara)
      expect(Object.keys(b.absences).length).toBe(7)
      expect(b.minutes_contrat).toBe(0)
      expect(b.minutes).toBe(0)
    }
    const b = bilanDe(p.analyser('2026-11-16'), agathe)
    expect(b.minutes_contrat).toBe(32 * 60)
    expect(b.minutes).toBe(32 * 60)
    expect(b.alertes).toEqual([])
  }, 30_000)

  it('vrai hôtel : les extras ne sont jamais placés d’office', () => {
    const p = reel()
    const extras = new Set(
      p.referentiel.salaries
        .filter((x) => x.type_contrat === 'extra')
        .map((x) => x.id),
    )
    for (const prenom of ['Clara', 'Agathe', 'Lise', 'Théo', 'Antoine']) {
      p.absent(p.salarie(prenom).id, '2026-12-07', '2026-12-13', 'CP')
    }
    const sem = p.generer('2026-12-07')
    expect(sem.affectations.some((a) => extras.has(a.salarie_id))).toBe(false)
    expect(sem.a_pourvoir.length).toBeGreaterThan(0)
    const raisons = sem.a_pourvoir
      .flatMap((t) => t.raisons)
      .filter((r) => extras.has(r.salarie_id))
    expect(raisons.length).toBeGreaterThan(0)
    expect(
      raisons.every((r) => r.messages[0].includes('extra disponible')),
    ).toBe(true)
  }, 30_000)

  it('vrai hôtel : horaires fixes posés d’avance', () => {
    const p = reel()
    const fixes = new Set(
      p.referentiel.salaries.filter(aJoursFixesDans).map((x) => x.id),
    )
    const tech = p.salarie('Paul').id
    const clara = p.salarie('Clara')
    p.absent(tech, '2026-11-04', '2026-11-04', 'CP')
    p.poser(LUNDI, clara.id, clara.competences[0].poste_id, 0, {
      debut: '07:00',
      fin: '15:45',
    })
    let sem = p.generer(LUNDI, { seulement: fixes })
    expect(new Set(sem.affectations.map((a) => a.salarie_id))).toEqual(
      new Set([...fixes, clara.id]),
    )
    expect(
      sem.affectations.some((a) => a.salarie_id === tech && a.jour === 2),
    ).toBe(false)
    sem = p.generer(LUNDI)
    expect(sem.stats.pourvues).toBe(sem.stats.places)
    expect(sem.stats.infractions).toBe(0)
  }, 30_000)

  it('désactiver puis réactiver', () => {
    const p = reel()
    const max = p.salarie('Max')
    // Son shift réel d'une semaine passée (S40 : 07:00 → 13:00, sans pause).
    p.poser('2026-09-28', max.id, p.poste('Réception'), 4, {
      debut: '07:00',
      fin: '13:00',
    })
    max.actif = false
    expect(p.analyser(LUNDI).bilan.some((b) => b.salarie_id === max.id)).toBe(
      false,
    )
    expect(
      p
        .analyser('2026-09-28')
        .affectations.some((a) => a.salarie_id === max.id),
    ).toBe(true)
    max.actif = true
    expect(p.analyser(LUNDI).bilan.some((b) => b.salarie_id === max.id)).toBe(
      true,
    )
  })
})

// ====================================================== test_audit_api.py

describe('shift sans code (test_audit_api.py)', () => {
  it('un shift passé en horaire spécifique garde ses heures et sa pause', () => {
    const p = reel()
    let sem = p.generer(LUNDI)
    const a = sem.affectations.find((x) => x.type_shift_id !== null)!
    p.semaines.set(
      LUNDI,
      p
        .shifts(LUNDI)
        .map((x): Affectation =>
          x.id === a.id ? { ...x, horaire_id: null } : x,
        ),
    )
    sem = p.analyser(LUNDI)
    const b = sem.affectations.find((x) => x.id === a.id)!
    expect(b.type_shift_id).toBeNull()
    expect(b.duree).toBe(a.duree)
  })

  it('un code libre supprimé : le shift garde sa pause et sa durée', () => {
    const p = reel()
    p.referentiel.horaires.push({
      id: 100,
      code: 'Z',
      nom: 'Z',
      debut: '08:00',
      fin: '17:00',
      couleur: '#000000',
      pause: 60,
      raccourci: 0,
      raccourci_debut: 0,
    })
    const x = p.salarie('Clara')
    let sem = p.poser(LUNDI, x.id, x.competences[0].poste_id, 0, { code: 'Z' })
    const a = siens(sem, x.id).find((s) => s.jour === 0)!
    expect([a.pause, a.duree]).toEqual([60, 480])
    // Suppression du code (RPC planning_supprimer_horaire) : le shift passe sans code.
    p.semaines.set(
      LUNDI,
      p
        .shifts(LUNDI)
        .map((s) => (s.id === a.id ? { ...s, horaire_id: null } : s)),
    )
    p.referentiel.horaires = p.referentiel.horaires.filter((h) => h.id !== 100)
    sem = p.analyser(LUNDI)
    const b = sem.affectations.find((s) => s.id === a.id)!
    expect(b.type_shift_id).toBeNull()
    expect([b.pause, b.duree]).toEqual([60, 480])
  })
})

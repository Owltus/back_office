import { describe, expect, it } from 'vitest'

import { versSolveur } from '#/lib/planning/regles.ts'
import {
  analyser,
  aPoserFixes,
  avecHistoire,
  contexte,
  fiche,
  joursFixesManquants,
  weekendsLiberes,
} from '#/lib/planning/semaine.ts'
import type { DonneesSemaine } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import { ajouterJours, MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import type {
  Absence,
  Affectation,
  Motif,
  Salarie,
} from '#/lib/planning/types.ts'

/*
 * `avecHistoire` (relecture du 2026-11-03) : ce que les règles morales du
 * PRD lisent des semaines d'avant et autour de l'école. Hôtel fictif
 * (`hotelDemo`) : une personne à 39 h (id 3), Réception et Club.
 */

const H = 60
const LUNDI = '2026-11-16'
const ID = 3
const L = (k: number) => ajouterJours(LUNDI, -7 * k)

const demo = hotelDemo(LUNDI)
const reception = demo.referentiel.postes.find((p) => p.nom === 'Réception')!
const matin = demo.referentiel.horaires.find((h) => h.debut === '07:00')!
// Motifs de l'hôtel réel absents du jeu fictif : un repos, un sans solde.
const REPOS: Motif = {
  id: 90,
  code: 'R',
  nom: 'Repos',
  couleur: '#000000',
  decompte: false,
  nature: 'repos',
}
const SANS_SOLDE: Motif = {
  ...REPOS,
  id: 91,
  code: 'SS',
  nom: 'Sans solde',
  decompte: true,
  nature: 'absence',
}
const motif = (code: string) =>
  [...demo.referentiel.motifs, REPOS, SANS_SOLDE].find((m) => m.code === code)!
    .id

let n = 0
/** Les shifts d'une semaine `lundi` aux jours `jours`, matin de 8 h. */
function shifts(lundi: string, jours: number[], id = ID): Affectation[] {
  return jours.map((jour) => ({
    id: ++n,
    lundi,
    salarie_id: id,
    poste_id: reception.id,
    jour,
    horaire_id: matin.id,
    debut: matin.debut,
    fin: matin.fin,
    epinglee: true,
    pause: matin.pause,
  }))
}
function absences(code: string, dates: string[]): Absence[] {
  return dates.map((jour) => ({
    id: ++n,
    salarie_id: ID,
    jour,
    motif_id: motif(code),
  }))
}
const jours = (lundi: string, liste: number[]) =>
  liste.map((j) => ajouterJours(lundi, j))
const TOUS = [0, 1, 2, 3, 4, 5, 6]

/** La personne `ID`, relue après `avecHistoire`. */
function lire(
  historique: Affectation[],
  abs: Absence[] = [],
  semaineType?: Salarie['semaine_type'],
) {
  const salaries = demo.referentiel.salaries.map((x) =>
    x.id === ID && semaineType ? { ...x, semaine_type: semaineType } : x,
  )
  const d: DonneesSemaine = {
    lundi: LUNDI,
    referentiel: {
      ...demo.referentiel,
      salaries,
      motifs: [...demo.referentiel.motifs, REPOS, SANS_SOLDE],
    },
    // Les absences du jeu fictif ne touchent pas la personne `ID`.
    absences: [...demo.absences.filter((a) => a.salarie_id !== ID), ...abs],
    affectations: [],
    avant: historique.filter((a) => a.lundi === L(1)),
    avantAvant: historique.filter((a) => a.lundi === L(2)),
    apres: [],
    historique,
  }
  const ctx = contexte(d)
  const x = ctx.staff.find((s) => s.id === ID)!
  const r = avecHistoire(
    d,
    ctx,
    new Map([[ID, versSolveur(fiche(x, LUNDI, ctx))]]),
  )
  return r.get(ID)!
}

/** Trois semaines d'avant toutes travaillées, sauf `libres` (k → jours). */
function travaillees(libres: Record<number, number[]> = {}): Affectation[] {
  return [1, 2, 3].flatMap((k) =>
    shifts(
      L(k),
      TOUS.filter((j) => j !== 2 && !(libres[k] ?? []).includes(j)),
    ),
  )
}

describe('règle 4 : le week-end libre des 3 semaines d’avant', () => {
  it('trouvé ou non', () => {
    expect(lire(travaillees()).weekendLibreAvant).toBe(false)
    expect(lire(travaillees({ 2: [5, 6] })).weekendLibreAvant).toBe(true)
    // Un samedi seul ne fait pas un week-end.
    expect(lire(travaillees({ 2: [5] })).weekendLibreAvant).toBe(false)
  })
  it('congé payé : libre ; maladie, sans solde, école : non', () => {
    const h = travaillees({ 2: [5, 6] })
    const we = jours(L(2), [5, 6])
    expect(lire(h, absences('CP', we)).weekendLibreAvant).toBe(true)
    expect(lire(h, absences('R', we)).weekendLibreAvant).toBe(true)
    expect(lire(h, absences('MA', we)).weekendLibreAvant).toBe(false)
    expect(lire(h, absences('SS', we)).weekendLibreAvant).toBe(false)
    expect(lire(h, absences('FO', we)).weekendLibreAvant).toBe(false)
    expect(lire(h, absences('EC', we)).weekendLibreAvant).toBe(false)
    // Samedi en congé, dimanche sans rien : libre.
    expect(lire(h, absences('CP', jours(L(2), [5]))).weekendLibreAvant).toBe(
      true,
    )
  })
  it('une semaine pas encore faite : inconnu', () => {
    const h = travaillees().filter((a) => a.lundi !== L(3))
    expect(lire(h).weekendLibreAvant).toBeNull()
  })
  it('la nuit du dimanche au lundi, écrite le dimanche, rend le week-end travaillé (Q15)', () => {
    // Week-end de la semaine -2 libre, sauf une nuit 24:00-07:00 posée le
    // dimanche (celle qui commence lundi à minuit).
    const nuit = (lundi: string): Affectation => ({
      id: ++n,
      lundi,
      salarie_id: ID,
      poste_id: reception.id,
      jour: 6,
      horaire_id: null,
      debut: '24:00',
      fin: '07:00',
      epinglee: true,
      pause: 0,
    })
    const h = travaillees({ 2: [5, 6] })
    expect(lire(h).weekendLibreAvant).toBe(true)
    expect(lire([...h, nuit(L(2))]).weekendLibreAvant).toBe(false)
  })
  it('la nuit du vendredi au samedi aussi : on finit le samedi matin (2026-11-03)', () => {
    const h = travaillees({ 2: [4, 5, 6] })
    const vendredi = (debut: string, fin: string): Affectation => ({
      id: ++n,
      lundi: L(2),
      salarie_id: ID,
      poste_id: reception.id,
      jour: 4,
      horaire_id: null,
      debut,
      fin,
      epinglee: true,
      pause: 0,
    })
    expect(lire([...h, vendredi('23:00', '07:00')]).weekendLibreAvant).toBe(
      false,
    )
    // Refusé : un vendredi de jour laisse le week-end libre.
    expect(lire([...h, vendredi('09:00', '17:00')]).weekendLibreAvant).toBe(
      true,
    )
  })
})

describe('règle 4, partage d’abord : la semaine type cède pour le week-end (2026-11-03)', () => {
  // Repos lundi, travail du mardi au samedi, repos dimanche.
  const type: Salarie['semaine_type'] = TOUS.map((j) =>
    j === 0 || j === 6
      ? { mode: 'repos' as const }
      : { mode: 'travail' as const },
  )
  it('sans week-end libre depuis 3 semaines : ni repos fixes, ni samedi habituel', () => {
    const s = lire(travaillees(), [], type)
    expect(s.weekendFixe).toBe(true)
    expect(s.weekendLibere).toBe(true)
    expect([...s.reposFixes]).toEqual([])
    expect([...s.travailFixe].sort()).toEqual([1, 2, 3, 4])
  })
  it('refusé : un week-end libre récent, la semaine type reste', () => {
    const s = lire(travaillees({ 2: [5, 6] }), [], type)
    expect(s.weekendLibere).toBe(false)
    expect([...s.reposFixes].sort()).toEqual([0, 6])
    expect([...s.travailFixe].sort()).toEqual([1, 2, 3, 4, 5])
  })
  it('refusé : sans week-end fixé, rien ne change', () => {
    const s = lire(travaillees())
    expect(s.weekendLibere).toBe(false)
  })
  it('la pose des fixes ne pose pas le samedi libéré', () => {
    const d = (h: Affectation[]): DonneesSemaine => ({
      lundi: LUNDI,
      referentiel: {
        ...demo.referentiel,
        salaries: demo.referentiel.salaries.map((x) =>
          x.id === ID ? { ...x, semaine_type: type } : x,
        ),
        verrous: [],
      },
      absences: demo.absences.filter((a) => a.salarie_id !== ID),
      affectations: [],
      avant: h.filter((a) => a.lundi === L(1)),
      avantAvant: h.filter((a) => a.lundi === L(2)),
      apres: [],
      historique: h,
    })
    const sans = d(travaillees())
    expect(weekendsLiberes(sans).has(ID)).toBe(true)
    const x = sans.referentiel.salaries.find((s) => s.id === ID)!
    expect(joursFixesManquants(x, sans, L(1))).toEqual([1, 2, 3, 4])
    expect(aPoserFixes(sans, L(1)).has(ID)).toBe(true)
    const avec = d(travaillees({ 2: [5, 6] }))
    expect(weekendsLiberes(avec).has(ID)).toBe(false)
    // Inconnu (une semaine d'avant pas faite) : pas libéré.
    const inconnu = d(travaillees().filter((a) => a.lundi !== L(3)))
    expect(weekendsLiberes(inconnu).has(ID)).toBe(false)
    // L'écran le dit : week-end libre à la place de la semaine type, sans
    // alerte de jour habituel pour le samedi.
    const regles = (donnees: DonneesSemaine) =>
      analyser({ ...donnees, affectations: shifts(LUNDI, [0, 1, 2, 3, 4]) })
        .bilan.find((b) => b.salarie_id === ID)!
        .alertes.map((a) => a.regle)
    expect(regles(sans)).toContain('WEEKEND-LIBERE')
    expect(regles(sans)).not.toContain('JOUR-HABITUEL')
    // Refusé : un week-end libre récent, le samedi reste un jour habituel.
    expect(regles(avec)).not.toContain('WEEKEND-LIBERE')
    expect(regles(avec)).toContain('JOUR-HABITUEL')
    expect(joursFixesManquants(x, avec, L(1))).toEqual([1, 2, 3, 4, 5])
  })
})

describe('règle 8 : les repos de la semaine d’avant', () => {
  it('jours de semaine libres, et le week-end travaillé ou non', () => {
    const s = lire(travaillees())
    expect([...s.reposAvant]).toEqual([2])
    expect(s.weekendTravailleAvant).toBe(true)
    const t = lire(travaillees({ 1: [5, 6] }))
    expect(t.weekendTravailleAvant).toBe(false)
    // Un jour d'absence n'est pas un repos à garder.
    expect([
      ...lire(travaillees(), absences('CP', jours(L(1), [2]))).reposAvant,
    ]).toEqual([])
  })
})

describe('règle 13 : la semaine du retour d’un congé', () => {
  // Week-end en repos dans la semaine type, le reste libre au calcul.
  const reposWe: Salarie['semaine_type'] = TOUS.map((j) =>
    j >= 5 ? { mode: 'repos' as const } : { mode: 'auto' as const },
  )
  const avant = [2, 3].flatMap((k) => shifts(L(k), [0, 1, 2, 3, 4]))
  it('seuil : 4 jours de congé, non ; 5, oui', () => {
    const cinq = absences('CP', jours(L(1), [0, 1, 2, 3, 4]))
    expect(lire(avant, cinq, reposWe).retourConge).toBe(0)
    const quatre = absences('CP', jours(L(1), [1, 2, 3, 4]))
    expect(lire(avant, quatre, reposWe).retourConge).toBeNull()
  })
  it('les repos font le pont sans compter : 3 jours de congé et 2 repos, non', () => {
    const trois = absences('CP', jours(L(1), [2, 3, 4]))
    expect(lire(avant, trois, reposWe).retourConge).toBeNull()
    // Jeudi et vendredi, le week-end en repos, puis le lundi : 3 jours de
    // congé, pas 5.
    const autour = absences('CP', [...jours(L(2), [3, 4]), L(1)])
    const h = [...shifts(L(3), [0, 1, 2, 3, 4]), ...shifts(L(2), [0, 1, 2])]
    expect(lire(h, autour, reposWe).retourConge).toBeNull()
    // Le même pont avec 5 jours de congé : un retour, cette semaine.
    const cinq = absences('CP', [
      ...jours(L(2), [3, 4]),
      ...jours(L(1), [0, 1, 2]),
    ])
    expect(lire(h, cinq, reposWe).retourConge).toBe(0)
  })
  it('à cheval sur la semaine d’avant : reprise le jeudi', () => {
    const abs = absences('CP', [
      ...jours(L(1), [3, 4]),
      ...jours(LUNDI, [0, 1, 2]),
    ])
    expect(lire(avant, abs, reposWe).retourConge).toBe(3)
  })
  it('déjà repris la semaine d’avant : rien', () => {
    const abs = absences('CP', jours(L(2), [0, 1, 2, 3, 4]))
    const h = [...shifts(L(3), [0, 1, 2, 3, 4]), ...shifts(L(1), [0, 1])]
    expect(lire(h, abs, reposWe).retourConge).toBeNull()
  })
})

describe('règle 14 : les abords de l’école', () => {
  it('veille et lendemain, semaines voisines comprises', () => {
    const abs = absences('EC', [
      ajouterJours(LUNDI, -1), // dimanche d'avant
      ajouterJours(LUNDI, 2), // mercredi
      ajouterJours(LUNDI, 7), // lundi d'après
    ])
    const s = lire(travaillees(), abs)
    expect([...s.debutApresEcole]).toEqual([
      [0, 8 * H],
      [3, 3 * MINUTES_PAR_JOUR + 8 * H],
    ])
    expect([...s.finAvantEcole]).toEqual([
      [1, MINUTES_PAR_JOUR + 21 * H],
      [6, 6 * MINUTES_PAR_JOUR + 21 * H],
    ])
  })
})

describe('règle 12 : les heures au-delà du contrat', () => {
  it('une semaine au-delà, une semaine à congé en dessous', () => {
    // Semaine -1 : 5 matins de 8 h pour 39 h dues, 1 h en plus. Semaine
    // -2 : un congé le lundi et 3 matins, en dessous de ses heures dues.
    const h = [...shifts(L(1), [0, 1, 2, 3, 4]), ...shifts(L(2), [1, 2, 3])]
    const s = lire(h, absences('CP', [L(2)]))
    expect(s.equiteAvant.minutesEnPlus).toBe(1 * H)
    expect(s.equiteAvant.semainesEnPlus).toBe(1)
  })
})

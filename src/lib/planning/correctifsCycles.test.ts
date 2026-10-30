import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { postesAvecNuit, verifierReglages } from '#/lib/planning/coherence.ts'
import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import { creneau, probleme, salarieSolveur } from '#/lib/planning/modele.ts'
import type { AffectationSolveur, Creneau } from '#/lib/planning/modele.ts'
import { bilanPresence, posteADesCodesDeNuit } from '#/lib/planning/presence.ts'
import { phraseCommune } from '#/lib/planning/raisonsPlaces.ts'
import {
  analyser,
  contexte,
  creneauBesoin,
  heureMurale,
  preparerGeneration,
  raisonCommune,
} from '#/lib/planning/semaine.ts'
import type { DonneesSemaine } from '#/lib/planning/semaine.ts'
import type {
  Affectation,
  Besoin,
  Consigne,
  Horaire,
  Poste,
  Salarie,
} from '#/lib/planning/types.ts'
import {
  presenceParCycle,
  trous,
  violations,
} from '#/lib/planning/verificateur.ts'
import type { Violation } from '#/lib/planning/verificateur.ts'

/*
 * Correctifs de la relecture du chantier planning-cycles-2026-10-30 (agent
 * « V4 Correctifs »). Chaque test échoue sans son correctif (mutation posée
 * à la main puis retirée). Données fictives, pseudonymes seulement.
 */

const H = 60
const J = 24 * H
const LUNDI = '2026-11-02'
const AUJOURDHUI = '2026-09-01'

let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const ACCUEIL = 1
const VEILLE = 2
const TOUS = 3
const code = (
  id: number,
  c: string,
  debut: string,
  fin: string,
  periode: Horaire['periode'],
  kw: Partial<Horaire> = {},
): Horaire => ({
  id,
  code: c,
  nom: c,
  debut,
  fin,
  couleur: '#888888',
  pause: 30,
  raccourci: 0,
  raccourci_debut: 0,
  periode,
  code_rouge: false,
  ...kw,
})
const M3 = code(1, 'M3', '07:00', '15:00', 'matin')
const M6 = code(2, 'M6', '08:00', '16:00', 'matin')
const S4 = code(3, 'S4', '15:00', '23:00', 'soir')
const N = code(9, 'N', '23:00', '07:00', 'nuit')
const C = code(10, 'C', '07:00', '12:00', 'court')
const HORAIRES = [M3, M6, S4, N, C]
const poste = (
  id: number,
  nom: string,
  horaires_autorises: number[],
  presence: boolean,
): Poste => ({
  id,
  nom,
  categorie: id === VEILLE ? 'veille_nuit' : 'reception',
  couleur: '#111111',
  horaires_autorises,
  a_part: false,
  presence,
})
const POSTES: Poste[] = [
  poste(ACCUEIL, 'Accueil', [1, 2, 3], true),
  poste(VEILLE, 'Veille', [9], false),
  // « Tous les codes » : liste vide.
  poste(TOUS, 'Polyvalent', [], true),
]
const personne = (
  id: number,
  prenom: string,
  niveau: 'titulaire' | 'soutien' = 'titulaire',
): Salarie => ({
  id,
  prenom,
  nom: 'Essai',
  groupe_id: null,
  type_contrat: niveau === 'soutien' ? 'apprenti' : 'cdi',
  heures_hebdo: 35,
  forfait_jours: false,
  mineur: false,
  competences: [{ poste_id: ACCUEIL, niveau }],
  semaine_type: Array.from({ length: 7 }, () => ({ mode: 'auto' as const })),
  shifts_autorises: [],
  date_entree: null,
  date_sortie: null,
  actif: true,
  suite_de: null,
})
const ALPHA = personne(10, 'Alpha')
const BRAVO = personne(11, 'Bravo')
const DELTA = personne(13, 'Delta', 'soutien')
const ECHO = personne(14, 'Echo', 'soutien')
const besoin = (
  id: number,
  h: Horaire,
  jour = 1,
  kw: Partial<Besoin> = {},
): Besoin => ({
  id,
  poste_id: ACCUEIL,
  jour,
  horaire_id: h.id,
  debut: h.debut,
  fin: h.fin,
  effectif: 1,
  soutien: 0,
  renfort: 0,
  ...kw,
})
let prochainId = 5000
const shift = (
  x: Salarie,
  h: Horaire,
  jour = 1,
  kw: Partial<Affectation> = {},
): Affectation => ({
  id: prochainId++,
  lundi: LUNDI,
  salarie_id: x.id,
  poste_id: ACCUEIL,
  jour,
  horaire_id: h.id,
  debut: h.debut,
  fin: h.fin,
  epinglee: true,
  court: false,
  pause: h.pause,
  ...kw,
})
const donnees = (
  besoins: Besoin[],
  affectations: Affectation[],
  salaries: Salarie[] = [ALPHA, BRAVO],
  consignes: Consigne[] = [],
  horaires: Horaire[] = HORAIRES,
): DonneesSemaine => ({
  lundi: LUNDI,
  referentiel: {
    horaires,
    motifs: [],
    postes: POSTES,
    groupes: [],
    salaries,
    besoins,
    consignes,
    verrous: [],
  },
  absences: [],
  affectations,
  avant: [],
  apres: [],
})

// ------------------------------------------------------------------ 1

describe('1. la nuit ne compte que sur un poste qui LISTE un code de nuit (D15)', () => {
  it('un poste « Tous les codes » n’a pas de code de nuit', () => {
    expect(posteADesCodesDeNuit(POSTES[2], HORAIRES)).toBe(false)
    expect(posteADesCodesDeNuit(POSTES[1], HORAIRES)).toBe(true)
    expect(posteADesCodesDeNuit(POSTES[0], HORAIRES)).toBe(false)
    expect(posteADesCodesDeNuit(undefined, HORAIRES)).toBe(false)
  })

  it('contrôle des réglages et assemblage disent la même chose', () => {
    const d = donnees([], [])
    expect([...postesAvecNuit(d.referentiel)]).toEqual([VEILLE])
    const ctx = contexte(d)
    const surTous = creneauBesoin(ctx, { ...besoin(1, N), poste_id: TOUS })
    const surVeille = creneauBesoin(ctx, { ...besoin(2, N), poste_id: VEILLE })
    // Refusé : une nuit sur un poste « Tous » ne compte pas.
    expect(surTous.presence).toBeNull()
    // Accepté : la veille de nuit fait le minimum de nuit.
    expect(surVeille.presence).toBe('nuit')
    // Le matin d'un poste « Tous » coché présence compte toujours.
    expect(
      creneauBesoin(ctx, { ...besoin(3, M3), poste_id: TOUS }).presence,
    ).toBe('matin')
  })
})

// ------------------------------------------------------------------ 2

describe('2. un soutien rattaché par cycle tient sa place de soutien', () => {
  it('apprenti en M6 sur une place de soutien M3 : plus de place ouverte, pas de second apprenti', async () => {
    const a = shift(DELTA, M6)
    const d = donnees(
      [besoin(100, M3, 1, { soutien: 1 })],
      [a, shift(ALPHA, M3)],
      [ALPHA, DELTA, ECHO],
    )
    // L'analyse le rattache à la place de soutien du M3.
    const sem = analyser(d)
    expect(sem.affectations.find((x) => x.id === a.id)).toMatchObject({
      besoin_id: 100,
      code_demande: M3.id,
    })
    const g = preparerGeneration(d, { aujourdhui: AUJOURDHUI })
    const b100 = g.probleme.creneaux.find((c) => c.id === 'b100') as Creneau
    // Refusé : la place de soutien n'est plus offerte au moteur.
    expect(b100.soutien).toBe(0)
    // Accepté : l'apprenti garde son vrai horaire (créneau `a…`, 08:00).
    const sien = g.probleme.creneaux.find((c) => c.id === `a${a.id}`)
    expect(sien && heureMurale(LUNDI, sien.debut)).toBe('08:00')
    const nouveaux = g.traduire(generer(g.probleme, highs))
    expect(
      nouveaux.filter((n) => n.jour === 1 && n.salarie_id === ECHO.id),
    ).toEqual([])
  })

  it('sans apprenti posé, la place de soutien reste offerte', () => {
    const d = donnees(
      [besoin(100, M3, 1, { soutien: 1 })],
      [shift(ALPHA, M3)],
      [ALPHA, DELTA, ECHO],
    )
    const g = preparerGeneration(d, { aujourdhui: AUJOURDHUI })
    expect(g.probleme.creneaux.find((c) => c.id === 'b100')?.soutien).toBe(1)
  })
})

// ------------------------------------------------------------------ 3

describe('3. raison commune : la première règle qui BLOQUE', () => {
  const v = (regle: string): Violation => ({
    salarieId: 'x',
    regle,
    message: '',
    creneaux: [],
    nature: 'loi',
  })
  it('un 6e jour commun ne cache pas un repos de 11 h commun', () => {
    const tous = new Map([
      ['a', [v('SIXIEME-JOUR'), v('R-REPOS-QUOTIDIEN')]],
      ['b', [v('SIXIEME-JOUR'), v('R-REPOS-QUOTIDIEN')]],
    ])
    const r = raisonCommune([tous])
    expect(r).toBe('R-REPOS-QUOTIDIEN')
    expect(phraseCommune(r)).not.toBeNull()
  })
  it('seule une règle non bloquante commune : elle reste (phrase nulle)', () => {
    const tous = new Map([
      ['a', [v('SIXIEME-JOUR')]],
      ['b', [v('R-REPOS-QUOTIDIEN'), v('SIXIEME-JOUR')]],
    ])
    expect(raisonCommune([tous])).toBe('SIXIEME-JOUR')
    expect(phraseCommune('SIXIEME-JOUR')).toBeNull()
  })
})

// ------------------------------------------------------------------ 4

describe('4. personnes par cycle : une affectation = une présence, partout', () => {
  it('le vérificateur compte comme analyser (bilanPresence)', () => {
    const c1 = creneau({
      id: 'c1',
      poste: '1',
      debut: 7 * H,
      fin: 15 * H,
      presence: 'matin',
    })
    const c2 = creneau({
      id: 'c2',
      poste: '1',
      debut: 8 * H,
      fin: 12 * H,
      presence: 'matin',
    })
    const s = salarieSolveur({
      id: 'a',
      postes: new Set(['1']),
      minutesHebdoContrat: 35 * H,
      minutesHebdoMax: 48 * H,
      minutesJourMax: 10 * H,
      joursTravaillesMaxSemaine: 6,
      reposQuotidienMin: 11 * H,
    })
    const consignes: Consigne[] = [
      { id: 1, jour: 0, periode: 'matin', minimum: 2, maximum: null },
    ]
    const p = probleme({ salaries: [s], creneaux: [c1, c2], consignes })
    const affs: AffectationSolveur[] = [
      { salarieId: 'a', creneauId: 'c1', court: false },
      { salarieId: 'a', creneauId: 'c2', court: false },
    ]
    const verif = presenceParCycle(p, affs)[0]
    const analyse = bilanPresence(consignes, [
      { jour: 0, periode: 'matin' },
      { jour: 0, periode: 'matin' },
    ])[0]
    expect(verif.compte).toBe(2)
    expect(verif.compte).toBe(analyse.compte)
    expect(verif.ecart).toBe(analyse.ecart)
  })
})

// ------------------------------------------------------------------ A

describe('A. minimum par cycle tenable par un code court', () => {
  it('un code court du matin permis tient le matin : pas de cycle-sans-code', () => {
    const r = donnees([], []).referentiel
    r.postes = [poste(ACCUEIL, 'Accueil', [S4.id, C.id], true)]
    r.consignes = [
      { id: 1, jour: 0, periode: 'matin', minimum: 1, maximum: null },
      { id: 2, jour: 0, periode: 'nuit', minimum: 1, maximum: null },
    ]
    const ids = verifierReglages(r, { aujourdhui: AUJOURDHUI }).map((p) => p.id)
    // Accepté : le court de 07:00 est un matin.
    expect(ids).not.toContain('cycle-sans-code:matin')
    // Refusé : aucun poste n'a de code de nuit.
    expect(ids).toContain('cycle-sans-code:nuit')
  })
})

// ------------------------------------------------------------------ B

describe('B. version courte qui commence plus tard (raccourci_debut)', () => {
  const S4c = code(3, 'S4', '15:00', '23:00', 'soir', {
    raccourci: 60,
    raccourci_debut: 30,
  })
  const s = (id: string) =>
    salarieSolveur({
      id,
      postes: new Set(['1']),
      minutesHebdoContrat: 35 * H,
      minutesHebdoMax: 48 * H,
      minutesJourMax: 10 * H,
      joursTravaillesMaxSemaine: 6,
      reposQuotidienMin: 11 * H,
    })

  it('vérificateur : repos de 11 h compté depuis la VRAIE fin (22:30)', () => {
    const soir = (raccourciDebut: number) =>
      creneau({
        id: 's',
        poste: '1',
        debut: 15 * H,
        fin: 23 * H,
        raccourci: 60,
        raccourciDebut,
      })
    const lendemain = (debut: number) =>
      creneau({ id: 'm', poste: '1', debut: J + debut, fin: J + debut + 6 * H })
    const repos = (raccourciDebut: number, debut: number) =>
      violations(
        probleme({
          salaries: [s('a')],
          creneaux: [soir(raccourciDebut), lendemain(debut)],
        }),
        [
          { salarieId: 'a', creneauId: 's', court: true },
          { salarieId: 'a', creneauId: 'm', court: false },
        ],
      ).filter((v) => v.regle === 'R-REPOS-QUOTIDIEN')
    // Court 15:30-22:30 : 09:15 le lendemain = 10 h 45, refusé.
    expect(repos(30, 9 * H + 15)).toHaveLength(1)
    // 09:30 = 11 h, accepté.
    expect(repos(30, 9 * H + 30)).toEqual([])
    // Tout le raccourci en fin (22:00) : 09:15 = 11 h 15, accepté.
    expect(repos(0, 9 * H + 15)).toEqual([])
  })

  const semaineCourte = (h: Horaire) => {
    const court = shift(BRAVO, h, 1, {
      court: true,
      debut: '15:30',
      fin: '22:30',
    })
    if (!h.raccourci_debut)
      Object.assign(court, { debut: '15:00', fin: '22:00' })
    return donnees(
      [besoin(100, M3), besoin(101, h)],
      [shift(ALPHA, M3), court],
      [ALPHA, BRAVO],
      [],
      HORAIRES.map((x) => (x.id === S4.id ? h : x)),
    )
  }
  const murale = (t: { debut: number; fin: number }) => [
    heureMurale(LUNDI, t.debut),
    heureMurale(LUNDI, t.fin),
  ]

  it('générateur et vérificateur voient les mêmes trous (début décalé)', () => {
    const g = preparerGeneration(semaineCourte(S4c), { aujourdhui: AUJOURDHUI })
    const r = generer(g.probleme, highs)
    const attendus = [
      ['15:00', '15:30'],
      ['22:30', '23:00'],
    ]
    expect(r.trous.map(murale)).toEqual(attendus)
    expect(trous(g.probleme, r.affectations).map(murale)).toEqual(attendus)
  })

  it('sans raccourci au début : seule la fin manque, comme avant', () => {
    const S4f = { ...S4c, raccourci_debut: 0 }
    const g = preparerGeneration(semaineCourte(S4f), { aujourdhui: AUJOURDHUI })
    const r = generer(g.probleme, highs)
    expect(r.trous.map(murale)).toEqual([['22:00', '23:00']])
    expect(trous(g.probleme, r.affectations).map(murale)).toEqual([
      ['22:00', '23:00'],
    ])
  })
})

import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { verifierReglages } from '#/lib/planning/coherence.ts'
import {
  construire,
  generer,
  RANG_AUTRE,
  rangPlace,
} from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  creneau,
  estIndispensable,
  probleme,
  rangImportance,
  salarieSolveur,
} from '#/lib/planning/modele.ts'
import type { Creneau, SalarieSolveur } from '#/lib/planning/modele.ts'
import { raisonClaire } from '#/lib/planning/raisonsPlaces.ts'
import {
  analyser,
  contexte,
  creneauBesoin,
  fermeturesPostes,
  ouverturesPostes,
} from '#/lib/planning/semaine.ts'
import type { DonneesSemaine } from '#/lib/planning/semaine.ts'
import { avecCode } from '#/lib/planning/test/codesTest.ts'
import type {
  Affectation,
  Besoin,
  Horaire,
  Poste,
  Salarie,
} from '#/lib/planning/types.ts'
import {
  ouverturesManquees,
  raisonsBlocage,
  trous,
} from '#/lib/planning/verificateur.ts'

/*
 * Étape 7 du plan `planning-moteur-configurable-2026-11-05` : importance des
 * postes (D11), besoin obligatoire ou souhaité (D4), niveau demandé
 * (titulaire seulement), fermeture d'un poste de l'accueil. Pour chaque
 * réglage, un cas accepté et un cas refusé, et le vérificateur dit la même
 * chose que le calcul. Données fictives.
 */

const H = 60
const J = 24 * H
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const cr = (
  id: string,
  poste: string,
  debutH: number,
  finH: number,
  kw: Partial<Creneau> = {},
): Creneau =>
  creneau({
    id,
    poste,
    debut: debutH * H,
    fin: finH * H,
    effectif: 1,
    jourPlanning: 0,
    ...kw,
  })
const personne = (
  id: string,
  contratH: number,
  kw: Partial<SalarieSolveur> = {},
): SalarieSolveur =>
  salarieSolveur({
    id,
    postes: new Set(['a', 'b']),
    minutesHebdoContrat: contratH * H,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 12 * H,
    joursTravaillesMaxSemaine: 6,
    joursPreferesSemaine: 5,
    reposQuotidienMin: 11 * H,
    ...kw,
  })
const tenus = (r: ReturnType<typeof generer>) =>
  r.affectations.map((a) => a.creneauId).sort()

describe('importance des postes : oui / non (D11, 2026-11-05)', () => {
  // Une seule personne sans heures dues, deux places à la même heure : la
  // place de « a » est plus longue, donc plus chère à laisser vide. Sans
  // importance, le calcul la prend.
  // « oui » : indispensable (booléen depuis le 2026-11-06).
  const places = (ia: string, ib: string) => [
    cr('a', 'a', 9, 17, { indispensable: ia === 'indispensable' }),
    cr('b', 'b', 9, 13, { indispensable: ib === 'indispensable' }),
  ]
  const resoudre = (cs: Creneau[], n = 1) =>
    generer(
      probleme({
        creneaux: cs,
        salaries: Array.from({ length: n }, (_, i) => personne(`p${i}`, 0)),
        graine: 1,
      }),
      highs,
    )

  it('un booléen, absent = non (2026-11-06)', () => {
    expect(estIndispensable({ indispensable: true })).toBe(true)
    expect(estIndispensable({ indispensable: false })).toBe(false)
    expect(estIndispensable({})).toBe(false)
    expect(estIndispensable(undefined)).toBe(false)
    expect(rangImportance(false)).toBe(RANG_AUTRE)
    expect(rangImportance(true)).toBeGreaterThan(RANG_AUTRE)
  })
  it('à réglage égal : une place vaut une place, le confort choisit', () => {
    // Deux places au même niveau, une personne : l'une est tenue, et le
    // même choix quel que soit le réglage commun (le confort tranche : la
    // plus courte, moins d'heures au-delà d'un contrat nul).
    const egal = tenus(resoudre(places('si_possible', 'si_possible')))
    expect(egal).toHaveLength(1)
    expect(tenus(resoudre(places('indispensable', 'indispensable')))).toEqual(
      egal,
    )
    // L'ancienne valeur ne fait plus un palier à part.
    expect(tenus(resoudre(places('important', 'si_possible')))).toEqual(egal)
  })
  it('un poste indispensable est rempli avant un poste qui ne l’est pas', () => {
    const r = resoudre(places('si_possible', 'indispensable'))
    expect(tenus(r)).toEqual(['b'])
    expect(r.manques.map((m) => m.creneauId)).toEqual(['a'])
    // Refusé dans l'autre sens : « a » indispensable passe devant.
    expect(tenus(resoudre(places('indispensable', 'si_possible')))).toEqual([
      'a',
    ])
  })
  it('une place non indispensable est tenue dès que quelqu’un peut la tenir', () => {
    const r = resoudre(places('si_possible', 'indispensable'), 2)
    expect(tenus(r)).toEqual(['a', 'b'])
    expect(r.manques).toEqual([])
  })
  it('paliers : un niveau chacun, le plus haut avec les heures dues', () => {
    const niveaux = (cs: Creneau[]) => {
      const { modele, manque } = construire(
        probleme({ creneaux: cs, salaries: [personne('p0', 0)] }),
      )
      const n = modele.niveaux()
      return Object.fromEntries(
        cs.map((c) => [c.id, n.find(([, m]) => m.has(manque.get(c.id)!))?.[0]]),
      )
    }
    // Un seul palier : au niveau essentiel, comme les heures dues.
    expect(niveaux(places('important', 'si_possible'))).toEqual({
      a: 'essentiel',
      b: 'essentiel',
    })
    // Deux paliers : le plus bas à son niveau, après les déplacements de
    // repos et l'équilibre, avant le confort.
    expect(niveaux(places('si_possible', 'indispensable'))).toEqual({
      a: `places-${RANG_AUTRE}`,
      b: 'essentiel',
    })
    expect(rangImportance(true)).toBeGreaterThan(RANG_AUTRE)
  })
  it('un poste neuf indispensable, au nom quelconque, est traité comme la Réception', () => {
    // Aucun nom ni id de poste dans le moteur : seul le réglage compte.
    const ZEPHYR = 9
    const postes: Poste[] = [
      { ...POSTES[0] },
      {
        id: ZEPHYR,
        nom: 'Zéphyr',
        jour_max_minutes: 690,
        couleur: '#333',
        horaires_autorises: [1, 2],
        zone_id: null,
        indispensable: true,
      },
      { ...POSTES[1], indispensable: false },
    ]
    const ctx = contexte(donnees([], [], [], postes))
    const z = creneauBesoin(ctx, besoin(1, { poste_id: ZEPHYR }))
    const t = creneauBesoin(ctx, besoin(2, { poste_id: TECH }))
    const reception = creneauBesoin(
      contexte(donnees([], [], [], [{ ...POSTES[0], indispensable: true }])),
      besoin(3, { poste_id: ACCUEIL }),
    )
    expect(z.indispensable).toBe(true)
    expect(rangPlace(z)).toBe(rangPlace(reception))
    expect(rangPlace(t)).toBeLessThan(rangPlace(z))
    // Au calcul : une seule personne, Zéphyr (plus court) passe devant
    // Technique (plus long, plus cher à laisser vide sans importance).
    const r = resoudre([
      { ...t, id: 't', poste: 'a', debut: 9 * H, fin: 17 * H, jourPlanning: 0 },
      { ...z, id: 'z', poste: 'b', debut: 9 * H, fin: 13 * H, jourPlanning: 0 },
    ])
    expect(tenus(r)).toEqual(['z'])
  })
})

describe('besoin souhaité (obligatoire = false, D4)', () => {
  it('rempli si possible : une personne libre le tient', () => {
    const r = generer(
      probleme({
        creneaux: [cr('s', 'a', 9, 17, { souhaite: true })],
        salaries: [personne('p', 0)],
        graine: 1,
      }),
      highs,
    )
    expect(tenus(r)).toEqual(['s'])
  })
  it('jamais devant un obligatoire, même d’un poste moins important', () => {
    // Le souhaité est plus long (plus cher à laisser vide) et d'un poste
    // indispensable : l'obligatoire « Si possible » passe quand même devant.
    const cs = [
      cr('s', 'a', 9, 17, { souhaite: true, indispensable: true }),
      cr('o', 'b', 9, 13, { indispensable: false }),
    ]
    const r = generer(
      probleme({ creneaux: cs, salaries: [personne('p', 0)], graine: 1 }),
      highs,
    )
    expect(tenus(r)).toEqual(['o'])
    // Refusé : le même créneau, obligatoire, passe devant.
    const r2 = generer(
      probleme({
        creneaux: [{ ...cs[0], souhaite: false }, cs[1]],
        salaries: [personne('p', 0)],
        graine: 1,
      }),
      highs,
    )
    expect(tenus(r2)).toEqual(['s'])
  })
  it('ne fait pas la plage du poste : aucun trou entre lui et le reste', () => {
    const cs = [
      cr('m', 'a', 7, 15, { presence: ['matin'] }),
      cr('s', 'a', 15.5, 23, { presence: ['soir'], souhaite: true }),
    ]
    const p = probleme({ creneaux: cs, salaries: [], graine: 1 })
    expect(trous(p, [])).toEqual([
      { poste: 'a', jour: 0, debut: 7 * H, fin: 15 * H },
    ])
    // Refusé : obligatoire, la plage va jusqu'à 23 h.
    const p2 = probleme({
      creneaux: [cs[0], { ...cs[1], souhaite: false }],
      salaries: [],
      graine: 1,
    })
    expect(trous(p2, []).at(-1)?.fin).toBe(23 * H)
    // Le calcul compte les mêmes trous.
    expect(generer(p, highs).trous).toEqual(trous(p, []))
  })
})

describe('niveau demandé : titulaire seulement', () => {
  const depannage = personne('d', 0, {
    postes: new Set(['a']),
    postesOccasionnels: new Set(['a']),
  })
  it('un dépannage ne tient pas la place ; il la tient sinon', () => {
    const c = cr('t', 'a', 9, 17, { niveauMax: { rang: 0, nom: 'Titulaire' } })
    const p = probleme({ creneaux: [c], salaries: [depannage], graine: 1 })
    const r = generer(p, highs)
    expect(tenus(r)).toEqual([])
    expect(r.manques).toEqual([{ creneauId: 't', manquant: 1 }])
    // Le vérificateur dit pourquoi.
    expect(
      raisonsBlocage(p, [], 't')
        .get('d')
        ?.map((v) => v.regle),
    ).toEqual(['TITULAIRE-DEMANDE'])
    expect(raisonClaire('TITULAIRE-DEMANDE', '', 1).phrase).toBe(
      'Son niveau sur ce poste ne suffit pas pour cette place',
    )
    const p2 = probleme({
      creneaux: [{ ...c, niveauMax: null }],
      salaries: [depannage],
      graine: 1,
    })
    expect(tenus(generer(p2, highs))).toEqual(['t'])
    expect(raisonsBlocage(p2, [], 't').get('d')).toEqual([])
  })
  it('un titulaire la tient', () => {
    const c = cr('t', 'a', 9, 17, { niveauMax: { rang: 0, nom: 'Titulaire' } })
    const r = generer(
      probleme({ creneaux: [c], salaries: [personne('x', 0)], graine: 1 }),
      highs,
    )
    expect(tenus(r)).toEqual(['t'])
  })
})

// ------------------------------------------------- avec la base (analyser)

const LUNDI = '2026-11-02'
const ACCUEIL = 1
const TECH = 2
const horaire = (
  id: number,
  debut: string,
  fin: string,
  periode: Horaire['periode'],
): Horaire =>
  avecCode<Horaire>(
    { id, nom: `${debut}`, debut, fin, couleur: '#888', pause: 30, periode },
    `H${id}`,
  )
const MATIN = horaire(1, '07:00', '15:00', 'matin')
const SOIR = horaire(2, '15:00', '23:00', 'soir')
const POSTES: Poste[] = [
  {
    id: ACCUEIL,
    nom: 'Accueil',
    jour_max_minutes: 720,
    couleur: '#111',
    horaires_autorises: [1, 2],
    zone_id: 1,
    fermeture: '23:00',
  },
  {
    id: TECH,
    nom: 'Technique',
    jour_max_minutes: 690,
    couleur: '#222',
    horaires_autorises: [1, 2],
    zone_id: null,
  },
]
const salarie = (id: number, niveau: 'titulaire' | 'occasionnel'): Salarie => ({
  id,
  prenom: `P${id}`,
  nom: 'Essai',
  groupe_id: null,
  type_contrat: 'cdi',
  heures_hebdo: 35,
  forfait_jours: false,
  mineur: false,
  competences: [{ poste_id: TECH, niveau }],
  semaine_type: Array.from({ length: 7 }, () => ({ mode: 'auto' as const })),
  shifts_autorises: [],
  date_entree: null,
  date_sortie: null,
  actif: true,
  suite_de: null,
})
const besoin = (id: number, kw: Partial<Besoin> = {}): Besoin => ({
  id,
  poste_id: TECH,
  jour: 1,
  horaire_id: MATIN.id,
  debut: MATIN.debut,
  fin: MATIN.fin,
  effectif: 1,
  soutien: 0,
  renfort: 0,
  ...kw,
})
const shift = (id: number, salarieId: number): Affectation => ({
  id,
  lundi: LUNDI,
  salarie_id: salarieId,
  poste_id: TECH,
  jour: 1,
  horaire_id: MATIN.id,
  debut: MATIN.debut,
  fin: MATIN.fin,
  epinglee: true,
  pause: 30,
})
const donnees = (
  besoins: Besoin[],
  affectations: Affectation[],
  salaries: Salarie[],
  postes: Poste[] = POSTES,
  /** Zone de l'accueil tenue en continu (défaut de l'hôtel) ; non : son
   * ouverture et sa fermeture se lisent (2026-11-11). */
  continu = true,
): DonneesSemaine => ({
  lundi: LUNDI,
  referentiel: {
    horaires: [MATIN, SOIR],
    motifs: [],
    postes,
    groupes: [],
    salaries,
    besoins,
    consignes: [0, 1, 2, 3, 4, 5, 6].flatMap((jour) => [
      {
        id: 2 * jour + 1,
        jour,
        periode: 'matin' as const,
        minimum: 1,
        maximum: 1,
      },
      {
        id: 2 * jour + 2,
        jour,
        periode: 'soir' as const,
        minimum: 1,
        maximum: 1,
      },
    ]),
    verrous: [],
    // Sans zone en base (défaut : tenue en continu), les besoins écrits se
    // lisent (`besoinsLus`) ; ces tests exercent le calcul des places.
    ...(continu
      ? {}
      : { zones: [{ id: 1, nom: 'Accueil', ordre: 0, continue: false }] }),
  },
  absences: [],
  affectations,
  avant: [],
  apres: [],
})

describe('analyse de la semaine', () => {
  it('un souhaité vide n’est pas une place à pourvoir ; un obligatoire l’est', () => {
    const tech = (o: boolean) =>
      analyser(donnees([besoin(10, { obligatoire: o })], [], []))
        .a_pourvoir.filter((a) => a.poste_id === TECH)
        .map((a) => a.besoin_id)
    expect(tech(false)).toEqual([])
    expect(tech(true)).toEqual([10])
  })
  it('un dépannage posé ne tient pas une place « titulaire seulement »', () => {
    const d = (niveau: Besoin['niveau_min'], qui: Salarie) =>
      analyser(
        donnees(
          [besoin(10, { niveau_min: niveau })],
          [shift(50, qui.id)],
          [qui],
        ),
      )
    const dep = salarie(7, 'occasionnel')
    const s1 = d('titulaire', dep)
    expect(s1.affectations[0].besoin_id).toBeNull()
    expect(s1.a_pourvoir.find((a) => a.besoin_id === 10)?.manquant).toBe(1)
    // Accepté : dépannage permis, ou un titulaire.
    expect(d('depannage', dep).affectations[0].besoin_id).toBe(10)
    expect(
      d('titulaire', salarie(8, 'titulaire')).affectations[0].besoin_id,
    ).toBe(10)
  })
  it('fermeture : la dernière heure du soir, comptée comme une ouverture', () => {
    // Zone tenue en continu : ni ouverture ni fermeture lues (2026-11-11,
    // la continuité et la passation le disent déjà).
    expect(fermeturesPostes(contexte(donnees([], [], [])))).toEqual([])
    expect(ouverturesPostes(contexte(donnees([], [], [])))).toEqual([])
    const ctx = contexte(donnees([], [], [], POSTES, false))
    const f = fermeturesPostes(ctx) ?? []
    expect(f).toHaveLength(7)
    expect(f[0]).toMatchObject({ poste: String(ACCUEIL), jour: 0 })
    expect(f[0].fin - f[0].debut).toBe(60)
    expect(f[0].fin).toBe(23 * H)
    // Après minuit : appartient au soir de la veille.
    const tard = contexte(
      donnees(
        [],
        [],
        [],
        [{ ...POSTES[0], fermeture: '00:30' }, POSTES[1]],
        false,
      ),
    )
    const g = (fermeturesPostes(tard) ?? [])[0]
    expect([g.debut, g.fin]).toEqual([23.5 * H, 24.5 * H])
    // Sans fermeture : rien.
    const sans = contexte(
      donnees(
        [],
        [],
        [],
        [{ ...POSTES[0], fermeture: null }, POSTES[1]],
        false,
      ),
    )
    expect(fermeturesPostes(sans)).toEqual([])
    // Le vérificateur la dit vide, et la semaine aussi.
    const p = probleme({ creneaux: [], salaries: [], graine: 1, fermetures: f })
    expect(ouverturesManquees(p, [])).toHaveLength(7)
    const sem = analyser(donnees([], [], [], POSTES, false))
    expect(
      sem.trous.filter((t) => t.poste_id === ACCUEIL && t.fin === '23:00'),
    ).toHaveLength(7)
  })
  it('un poste hors accueil avec une ouverture a un trou s’il n’est pas tenu (2026-11-06)', () => {
    // La Technique ouvre à 07:00 ; elle a un besoin le mardi (jour 1)
    // seulement : son ouverture vaut ce jour-là, pas les autres.
    const postes: Poste[] = [POSTES[0], { ...POSTES[1], ouverture: '07:00' }]
    const ctx = contexte(donnees([besoin(1)], [], [], postes))
    const o = ouverturesPostes(ctx) ?? []
    const tech = o.filter((x) => x.poste === String(TECH))
    expect(tech).toHaveLength(1)
    expect(tech[0]).toMatchObject({ jour: 1 })
    expect(tech[0].fin - tech[0].debut).toBe(60)
    // Personne : le vérificateur la dit vide, la semaine aussi.
    const p = probleme({
      creneaux: [],
      salaries: [],
      graine: 1,
      ouvertures: tech,
    })
    expect(ouverturesManquees(p, [])).toHaveLength(1)
    const vide = analyser(donnees([besoin(1)], [], [], postes))
    expect(
      vide.trous.filter((t) => t.poste_id === TECH && t.debut === '07:00'),
    ).toHaveLength(1)
    // Tenue par un titulaire : plus de trou.
    const tenue = analyser(
      donnees([besoin(1)], [shift(1, 7)], [salarie(7, 'titulaire')], postes),
    )
    expect(
      tenue.trous.filter((t) => t.poste_id === TECH && t.debut === '07:00'),
    ).toHaveLength(0)
    // Sans ouverture : rien.
    expect(
      (ouverturesPostes(contexte(donnees([besoin(1)], [], []))) ?? []).filter(
        (x) => x.poste === String(TECH),
      ),
    ).toEqual([])
  })
  it('fermeture tenue par le calcul : la personne du soir reste jusqu’à la fin', () => {
    // Une personne sans heures dues ; le soir finit à 21 h, la fermeture à
    // 23 h : seul un 15-23 la tient.
    const cs = [
      cr('court', 'a', 13, 21, { effectif: 0, facultatif: 1 }),
      cr('long', 'a', 15, 23, { effectif: 0, facultatif: 1 }),
    ]
    const ferm = [{ poste: 'a', jour: 0, debut: 22 * H, fin: 23 * H }]
    const avec = generer(
      probleme({
        creneaux: cs,
        salaries: [personne('p', 0)],
        graine: 1,
        fermetures: ferm,
      }),
      highs,
    )
    expect(tenus(avec)).toEqual(['long'])
    expect(avec.ouvertures).toEqual([])
    const sans = generer(
      probleme({ creneaux: cs, salaries: [personne('p', 0)], graine: 1 }),
      highs,
    )
    expect(tenus(sans)).toEqual([])
  })
})

// Le jour 0 de `cr` : rien d'autre ne dépend de J ici.
void J

describe('À vérifier : ce que les réglages rendent impossible', () => {
  const ids = (r: DonneesSemaine['referentiel']) =>
    verifierReglages(r).map((p) => p.id)
  it('fermeture sans horaire qui y va ; tenue sinon', () => {
    const ok = donnees([], [], [salarie(7, 'titulaire')]).referentiel
    expect(ids(ok)).not.toContain(`fermeture-impossible:${ACCUEIL}`)
    const tard = (continu: boolean) =>
      donnees(
        [],
        [],
        [salarie(7, 'titulaire')],
        [{ ...POSTES[0], fermeture: '23:30' }, POSTES[1]],
        continu,
      ).referentiel
    expect(ids(tard(false))).toContain(`fermeture-impossible:${ACCUEIL}`)
    // Tenue en continu : l'heure en base est ignorée, rien à dire.
    expect(ids(tard(true))).not.toContain(`fermeture-impossible:${ACCUEIL}`)
    const tot = donnees(
      [],
      [],
      [salarie(7, 'titulaire')],
      [{ ...POSTES[0], ouverture: '06:00' }, POSTES[1]],
      false,
    ).referentiel
    expect(ids(tot)).toContain(`ouverture-impossible:${ACCUEIL}`)
  })
  it('titulaire demandé sans aucun titulaire du poste', () => {
    const b = [besoin(10, { niveau_min: 'titulaire' })]
    expect(
      ids(donnees(b, [], [salarie(7, 'occasionnel')]).referentiel),
    ).toContain(`titulaire-demande:${TECH}`)
    expect(
      ids(donnees(b, [], [salarie(7, 'titulaire')]).referentiel),
    ).not.toContain(`titulaire-demande:${TECH}`)
  })
})

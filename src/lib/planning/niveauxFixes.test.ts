import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import { creneau, probleme, salarieSolveur } from '#/lib/planning/modele.ts'
import type { Creneau, SalarieSolveur } from '#/lib/planning/modele.ts'
import {
  demandeDe,
  LISTE_NIVEAUX,
  NIVEAU_DEPANNAGE,
  NIVEAU_SOUTIEN,
  NIVEAU_TITULAIRE,
  NIVEAUX,
} from '#/lib/planning/niveaux.ts'
import { versSolveur } from '#/lib/planning/regles.ts'
import { lireRegles } from '#/lib/planning/reglesEtablissement.ts'
import { analyser, fiche } from '#/lib/planning/semaine.ts'
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
  manquants,
  raisonsBlocage,
  soutiensSeuls,
} from '#/lib/planning/verificateur.ts'

/*
 * Les trois niveaux FIXES (décision de l'utilisateur du 2026-11-06, qui
 * renverse les niveaux réglables du lot 2, A7) : titulaire placé en
 * priorité, dépannage à défaut, soutien jamais seul. Les heures du contrat
 * passent avant « titulaire avant dépannage ». Données fictives.
 */

const H = 60
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

/** Une personne d'un niveau donné sur le poste « a ». */
function qui(id: string, niveau: string, contrat = 0): SalarieSolveur {
  const l = NIVEAUX.parId.get(niveau)
  if (!l) throw new Error(niveau)
  return salarieSolveur({
    id,
    postes: new Set(l.autonome ? ['a'] : []),
    postesOccasionnels: new Set(l.autonome && l.rang > 0 ? ['a'] : []),
    postesSoutien: new Set(l.autonome ? [] : ['a']),
    niveauxPostes: new Map([['a', l]]),
    minutesHebdoContrat: contrat,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 12 * H,
    joursTravaillesMaxSemaine: 6,
    reposQuotidienMin: 11 * H,
  })
}
const place = (kw: Partial<Creneau> = {}): Creneau =>
  creneau({
    id: 'p',
    poste: 'a',
    debut: 9 * H,
    fin: 17 * H,
    effectif: 1,
    jourPlanning: 0,
    ...kw,
  })
const tenus = (r: ReturnType<typeof generer>) =>
  r.affectations.map((a) => a.salarieId).sort()
const resoudre = (salaries: SalarieSolveur[], c: Creneau = place()) =>
  generer(probleme({ creneaux: [c], salaries, graine: 1 }), highs)

describe('les trois niveaux', () => {
  it('Titulaire, Dépannage, Soutien : fixes, dans cet ordre', () => {
    expect(LISTE_NIVEAUX.map((n) => [n.id, n.nom])).toEqual([
      ['titulaire', 'Titulaire'],
      ['occasionnel', 'Dépannage'],
      ['soutien', 'Soutien'],
    ])
    const t = NIVEAUX.parId.get(NIVEAU_TITULAIRE)
    const d = NIVEAUX.parId.get(NIVEAU_DEPANNAGE)
    const s = NIVEAUX.parId.get(NIVEAU_SOUTIEN)
    expect([t?.rang, t?.part, t?.autonome, t?.jamaisSeul]).toEqual([
      0,
      0,
      true,
      false,
    ])
    // Le dépannage coûte la part fixe entière, comme avant le lot A7.
    expect([d?.rang, d?.part, d?.autonome, d?.jamaisSeul]).toEqual([
      1,
      1,
      true,
      false,
    ])
    expect([s?.autonome, s?.jamaisSeul, s?.part]).toEqual([false, true, 0])
    expect(lireRegles({}).niveaux).toBe(NIVEAUX)
  })
  it('chaque niveau a sa phrase pour la fiche', () => {
    expect(LISTE_NIVEAUX.map((n) => n.phrase)).toEqual([
      'Placé en priorité sur ce poste. Peut être seul.',
      'Placé si aucun titulaire n’est disponible. Peut être seul.',
      'Jamais seul : toujours avec un titulaire ou un dépannage.',
    ])
  })
  it('la fiche lit le niveau ; une clé inconnue ne compte pas', () => {
    const x = {
      id: 1,
      prenom: 'A',
      nom: 'Essai',
      groupe_id: null,
      type_contrat: 'cdi',
      heures_hebdo: 35,
      forfait_jours: false,
      mineur: false,
      competences: [
        { poste_id: 3, niveau: NIVEAU_TITULAIRE },
        { poste_id: 4, niveau: NIVEAU_SOUTIEN },
        { poste_id: 5, niveau: NIVEAU_DEPANNAGE },
        { poste_id: 6, niveau: 'confirme' },
      ],
      semaine_type: Array.from({ length: 7 }, () => ({
        mode: 'auto' as const,
      })),
      shifts_autorises: [],
      date_entree: null,
      date_sortie: null,
      actif: true,
      suite_de: null,
    } satisfies Salarie
    const f = fiche(x, '2026-11-16', {
      sansDecompte: new Set(),
      ecole: new Set(),
      absences: new Map(),
      regles: lireRegles({}),
    })
    expect([...(f.postes ?? [])].sort()).toEqual(['3', '5'])
    expect([...(f.postesOccasionnels ?? [])]).toEqual(['5'])
    expect([...(f.postesSoutien ?? [])]).toEqual(['4'])
    expect(versSolveur(f).niveauxPostes?.get('3')?.nom).toBe('Titulaire')
  })
})

describe('titulaire, dépannage', () => {
  it('à heures égales, le titulaire est préféré au dépannage', () => {
    expect(
      tenus(resoudre([qui('d', NIVEAU_DEPANNAGE), qui('t', NIVEAU_TITULAIRE)])),
    ).toEqual(['t'])
    // Les noms ne décident de rien : les niveaux échangés, l'autre gagne.
    expect(
      tenus(resoudre([qui('d', NIVEAU_TITULAIRE), qui('t', NIVEAU_DEPANNAGE)])),
    ).toEqual(['d'])
  })
  it('le dépannage est placé quand aucun titulaire n’est libre', () => {
    const r = resoudre([qui('d', NIVEAU_DEPANNAGE)])
    expect(tenus(r)).toEqual(['d'])
    expect(r.manques).toEqual([])
  })
  it('un dépannage qui manque d’heures passe devant un titulaire qui a les siennes', () => {
    expect(
      tenus(
        resoudre([
          qui('t', NIVEAU_TITULAIRE, 0),
          qui('d', NIVEAU_DEPANNAGE, 8 * H),
        ]),
      ),
    ).toEqual(['d'])
  })
  it('une place « titulaire seulement » refuse le dépannage', () => {
    const d = demandeDe(NIVEAUX, {
      effectif: 1,
      soutien: 0,
      niveau_min: NIVEAU_TITULAIRE,
    })
    expect(d.niveauMax).toEqual({ rang: 0, nom: 'Titulaire' })
    const p = probleme({
      creneaux: [place({ niveauMax: d.niveauMax })],
      salaries: [qui('d', NIVEAU_DEPANNAGE)],
      graine: 1,
    })
    const r = generer(p, highs)
    expect(tenus(r)).toEqual([])
    expect(r.manques).toEqual([{ creneauId: 'p', manquant: 1 }])
    expect(raisonsBlocage(p, [], 'p').get('d')?.[0].message).toBe(
      'en dépannage sur ce poste : la place demande un titulaire',
    )
    // Sans niveau demandé : titulaire ou dépannage.
    expect(
      demandeDe(NIVEAUX, { effectif: 1, soutien: 0, niveau_min: null })
        .niveauMax,
    ).toBeNull()
  })
})

describe('soutien', () => {
  it('jamais seul', () => {
    const p = probleme({
      creneaux: [place({ effectif: 0, soutien: 1 })],
      salaries: [qui('s', NIVEAU_SOUTIEN)],
      graine: 1,
    })
    expect(tenus(generer(p, highs))).toEqual([])
    // Posé quand même (à la main) : le vérificateur le dit.
    expect(
      soutiensSeuls(p, [{ salarieId: 's', creneauId: 'p' }]).map(
        (v) => v.message,
      ),
    ).toEqual([
      'en soutien sur ce poste : ne peut pas être seul, personne d’autonome sur ce poste tout le shift',
    ])
  })
  it('avec un titulaire ou un dépannage', () => {
    for (const autonome of [NIVEAU_TITULAIRE, NIVEAU_DEPANNAGE]) {
      const p = probleme({
        creneaux: [place({ effectif: 1, soutien: 1 })],
        salaries: [qui('s', NIVEAU_SOUTIEN, 8 * H), qui('x', autonome)],
        graine: 1,
      })
      expect(tenus(generer(p, highs))).toEqual(['s', 'x'])
      expect(
        soutiensSeuls(p, [
          { salarieId: 's', creneauId: 'p' },
          { salarieId: 'x', creneauId: 'p' },
        ]),
      ).toEqual([])
    }
  })
  it('deux soutiens ne s’accompagnent pas', () => {
    const p = probleme({
      creneaux: [place({ effectif: 0, soutien: 2 })],
      salaries: [qui('s', NIVEAU_SOUTIEN), qui('u', NIVEAU_SOUTIEN)],
      graine: 1,
    })
    expect(tenus(generer(p, highs))).toEqual([])
  })
})

describe('un besoin « 1 titulaire et 2 en plus »', () => {
  const d = demandeDe(NIVEAUX, {
    effectif: 1,
    soutien: 0,
    niveaux: [
      { niveau: NIVEAU_DEPANNAGE, nombre: 2 },
      { niveau: NIVEAU_TITULAIRE, nombre: 1 },
    ],
  })
  const c = place({ effectif: d.effectif, paliers: d.paliers })

  it('se lit en paliers cumulés, effectif = la somme', () => {
    expect(d.effectif).toBe(3)
    expect(d.niveauMax).toBeNull()
    expect(d.paliers?.map((x) => [x.rang, x.cumul])).toEqual([
      [0, 1],
      [1, 3],
    ])
  })
  it('sans titulaire, laisse SA place vide (pas un troisième dépannage)', () => {
    const p = probleme({
      creneaux: [c],
      salaries: [
        qui('d1', NIVEAU_DEPANNAGE),
        qui('d2', NIVEAU_DEPANNAGE),
        qui('d3', NIVEAU_DEPANNAGE),
      ],
      graine: 1,
    })
    const r = generer(p, highs)
    expect(tenus(r)).toHaveLength(2)
    expect(r.manques).toEqual([{ creneauId: 'p', manquant: 1 }])
    expect(manquants(p, r.affectations).get('p')).toBe(1)
  })
  it('deux titulaires tiennent aussi une place en plus', () => {
    const r = resoudre(
      [
        qui('t1', NIVEAU_TITULAIRE),
        qui('t2', NIVEAU_TITULAIRE),
        qui('d1', NIVEAU_DEPANNAGE),
      ],
      c,
    )
    expect(r.manques).toEqual([])
    expect(tenus(r)).toEqual(['d1', 't1', 't2'])
  })
})

// ------------------------------------------------- avec la base (analyser)

describe('analyse : un nombre par niveau', () => {
  const LUNDI = '2026-11-02'
  const POSTE = 2
  const MATIN = avecCode<Horaire>(
    {
      id: 1,
      nom: '07:00',
      debut: '07:00',
      fin: '15:00',
      couleur: '#888',
      pause: 30,
      periode: 'matin',
    },
    'H1',
  )
  const postes: Poste[] = [
    {
      id: POSTE,
      nom: 'Salle',
      jour_max_minutes: 690,
      couleur: '#222',
      horaires_autorises: [1],
      zone_id: null,
    },
  ]
  const salarie = (id: number, niveau: string): Salarie => ({
    id,
    prenom: `P${id}`,
    nom: 'Essai',
    groupe_id: null,
    type_contrat: 'cdi',
    heures_hebdo: 35,
    forfait_jours: false,
    mineur: false,
    competences: [{ poste_id: POSTE, niveau }],
    semaine_type: Array.from({ length: 7 }, () => ({ mode: 'auto' as const })),
    shifts_autorises: [],
    date_entree: null,
    date_sortie: null,
    actif: true,
    suite_de: null,
  })
  const besoin: Besoin = {
    id: 10,
    poste_id: POSTE,
    jour: 1,
    horaire_id: 1,
    debut: '07:00',
    fin: '15:00',
    effectif: 1,
    soutien: 0,
    renfort: 1,
    niveaux: [
      { niveau: NIVEAU_TITULAIRE, nombre: 1 },
      { niveau: NIVEAU_DEPANNAGE, nombre: 2 },
    ],
  }
  const shift = (id: number, s: number): Affectation => ({
    id,
    lundi: LUNDI,
    salarie_id: s,
    poste_id: POSTE,
    jour: 1,
    horaire_id: 1,
    debut: '07:00',
    fin: '15:00',
    epinglee: true,
    pause: 30,
  })
  const donnees = (salaries: Salarie[]): DonneesSemaine => ({
    lundi: LUNDI,
    referentiel: {
      horaires: [MATIN],
      motifs: [],
      postes,
      groupes: [],
      salaries,
      besoins: [besoin],
      consignes: [],
      verrous: [],
    },
    absences: [],
    affectations: salaries.map((s, i) => shift(50 + i, s.id)),
    avant: [],
    apres: [],
  })
  const manque = (salaries: Salarie[]) =>
    analyser(donnees(salaries)).a_pourvoir.find((a) => a.besoin_id === 10)
      ?.manquant ?? 0

  it('trois dépannages posés : la place du titulaire reste à pourvoir', () => {
    expect(
      manque([
        salarie(1, NIVEAU_DEPANNAGE),
        salarie(2, NIVEAU_DEPANNAGE),
        salarie(3, NIVEAU_DEPANNAGE),
      ]),
    ).toBe(1)
  })
  it('un titulaire et deux dépannages : rien à pourvoir', () => {
    expect(
      manque([
        salarie(3, NIVEAU_DEPANNAGE),
        salarie(1, NIVEAU_TITULAIRE),
        salarie(2, NIVEAU_DEPANNAGE),
      ]),
    ).toBe(0)
  })
})

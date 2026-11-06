import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import { creneau, probleme, salarieSolveur } from '#/lib/planning/modele.ts'
import type { Creneau, SalarieSolveur } from '#/lib/planning/modele.ts'
import {
  demandeDe,
  lireNiveaux,
  NIVEAUX_HOTEL,
  NIVEAUX_PAR_DEFAUT,
} from '#/lib/planning/niveaux.ts'
import type { Niveaux } from '#/lib/planning/niveaux.ts'
import { versSolveur } from '#/lib/planning/regles.ts'
import { lireRegles } from '#/lib/planning/reglesEtablissement.ts'
import { analyser, fiche } from '#/lib/planning/semaine.ts'
import type { DonneesSemaine } from '#/lib/planning/semaine.ts'
import { avecCode } from '#/lib/planning/test/codesTest.ts'
import type {
  Affectation,
  Besoin,
  Horaire,
  NiveauEtab,
  Poste,
  Salarie,
} from '#/lib/planning/types.ts'
import {
  manquants,
  raisonsBlocage,
  soutiensSeuls,
} from '#/lib/planning/verificateur.ts'

/*
 * Lot 2, A7 du plan `planning-moteur-configurable-2026-11-05` (2026-11-06) :
 * les niveaux d'une personne sur un poste sont ceux de l'établissement
 * (`planning_niveaux`). Le calcul ne lit que leurs cases (ordre, autonome,
 * jamais seul), et un besoin peut demander un nombre par niveau. Données
 * fictives.
 */

const H = 60
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const niv = (
  id: string,
  nom: string,
  ordre: number,
  autonome = true,
  jamais_seul = false,
): NiveauEtab => ({ id, nom, ordre, autonome, jamais_seul })

/** Une personne d'un niveau donné sur le poste « a », sans heures dues. */
function qui(id: string, niveau: string, n: Niveaux): SalarieSolveur {
  const l = n.parId.get(niveau)
  if (!l) throw new Error(niveau)
  return salarieSolveur({
    id,
    postes: new Set(l.autonome ? ['a'] : []),
    postesOccasionnels: new Set(l.autonome && l.rang > 0 ? ['a'] : []),
    postesSoutien: new Set(l.autonome ? [] : ['a']),
    niveauxPostes: new Map([['a', l]]),
    minutesHebdoContrat: 0,
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

describe('les niveaux de l’hôtel', () => {
  it('Titulaire, Dépannage, Soutien : préféré, prix entier, non autonome', () => {
    const t = NIVEAUX_HOTEL.parId.get('titulaire')
    const d = NIVEAUX_HOTEL.parId.get('occasionnel')
    const s = NIVEAUX_HOTEL.parId.get('soutien')
    expect([t?.rang, t?.part, t?.autonome]).toEqual([0, 0, true])
    expect([d?.rang, d?.part, d?.autonome]).toEqual([1, 1, true])
    expect([s?.autonome, s?.jamaisSeul, s?.part]).toEqual([false, true, 0])
    // Sans ligne en base : ceux de l'hôtel.
    expect(lireNiveaux([]).liste).toEqual(NIVEAUX_PAR_DEFAUT)
    expect(lireRegles({}).niveaux.liste).toEqual(NIVEAUX_PAR_DEFAUT)
  })
  it('la fiche lit le niveau dans la liste de l’établissement', () => {
    const regles = lireRegles({
      niveaux: [niv('chef', 'Chef', 0), niv('aide', 'Aide', 1, false, false)],
    })
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
        { poste_id: 3, niveau: 'chef' },
        { poste_id: 4, niveau: 'aide' },
        // Un niveau inconnu ne compte pas.
        { poste_id: 5, niveau: 'titulaire' },
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
      regles,
    })
    expect([...(f.postes ?? [])]).toEqual(['3'])
    expect([...(f.postesSoutien ?? [])]).toEqual(['4'])
    expect(versSolveur(f).niveauxPostes?.get('3')?.nom).toBe('Chef')
  })
})

describe('un niveau « Confirmé » entre Titulaire et Dépannage', () => {
  const n = lireNiveaux([
    niv('titulaire', 'Titulaire', 0),
    niv('confirme', 'Confirmé', 1),
    niv('occasionnel', 'Dépannage', 2),
    niv('soutien', 'Soutien', 3, false, true),
  ])
  const resoudre = (salaries: SalarieSolveur[]) =>
    generer(probleme({ creneaux: [place()], salaries, graine: 1 }), highs)

  it('coûte une part du dépannage, le dépannage garde son prix', () => {
    expect(n.parId.get('confirme')?.part).toBe(0.5)
    expect(n.parId.get('occasionnel')?.part).toBe(1)
  })
  it('est préféré au dépannage', () => {
    expect(
      tenus(resoudre([qui('d', 'occasionnel', n), qui('c', 'confirme', n)])),
    ).toEqual(['c'])
    // Refusé dans l'autre sens : les noms ne décident de rien.
    expect(
      tenus(resoudre([qui('d', 'confirme', n), qui('c', 'occasionnel', n)])),
    ).toEqual(['d'])
  })
  it('passe après le titulaire', () => {
    expect(
      tenus(resoudre([qui('c', 'confirme', n), qui('t', 'titulaire', n)])),
    ).toEqual(['t'])
  })
  it('une place qui demande « Confirmé » refuse le dépannage', () => {
    const p = probleme({
      creneaux: [place({ niveauMax: { rang: 1, nom: 'Confirmé' } })],
      salaries: [qui('d', 'occasionnel', n)],
      graine: 1,
    })
    const r = generer(p, highs)
    expect(tenus(r)).toEqual([])
    expect(r.manques).toEqual([{ creneauId: 'p', manquant: 1 }])
    expect(raisonsBlocage(p, [], 'p').get('d')?.[0].message).toBe(
      'en dépannage sur ce poste : la place demande un confirmé',
    )
  })
})

describe('un besoin « 1 Responsable + 2 Équipiers »', () => {
  const n = lireNiveaux([
    niv('responsable', 'Responsable', 0),
    niv('equipier', 'Équipier', 1),
    niv('apprenti', 'Apprenti', 2, false, true),
  ])
  const d = demandeDe(n, {
    effectif: 1,
    soutien: 0,
    niveaux: [
      { niveau: 'equipier', nombre: 2 },
      { niveau: 'responsable', nombre: 1 },
    ],
  })
  const c = place({ effectif: d.effectif, paliers: d.paliers })
  const resoudre = (salaries: SalarieSolveur[]) => {
    const p = probleme({ creneaux: [c], salaries, graine: 1 })
    return { p, r: generer(p, highs) }
  }

  it('se lit en paliers cumulés, effectif = la somme', () => {
    expect(d.effectif).toBe(3)
    expect(d.niveauMax).toBeNull()
    expect(d.paliers?.map((x) => [x.rang, x.cumul])).toEqual([
      [0, 1],
      [1, 3],
    ])
    // Un seul niveau : le modèle d'avant (pas de paliers).
    expect(
      demandeDe(n, {
        effectif: 0,
        soutien: 0,
        niveaux: [{ niveau: 'responsable', nombre: 2 }],
      }),
    ).toEqual({
      effectif: 2,
      soutien: 0,
      niveauMax: { rang: 0, nom: 'Responsable' },
      paliers: null,
    })
  })
  it('est rempli ainsi', () => {
    const { r } = resoudre([
      qui('e1', 'equipier', n),
      qui('e2', 'equipier', n),
      qui('e3', 'equipier', n),
      qui('r1', 'responsable', n),
    ])
    expect(r.manques).toEqual([])
    const ids = tenus(r)
    expect(ids).toHaveLength(3)
    expect(ids).toContain('r1')
  })
  it('sans responsable, laisse SA place vide (pas un troisième équipier)', () => {
    const { p, r } = resoudre([
      qui('e1', 'equipier', n),
      qui('e2', 'equipier', n),
      qui('e3', 'equipier', n),
    ])
    expect(tenus(r)).toHaveLength(2)
    expect(r.manques).toEqual([{ creneauId: 'p', manquant: 1 }])
    // Le vérificateur compte la même place vide.
    expect(manquants(p, r.affectations).get('p')).toBe(1)
  })
  it('deux responsables tiennent aussi une place d’équipier', () => {
    const { r } = resoudre([
      qui('r1', 'responsable', n),
      qui('r2', 'responsable', n),
      qui('e1', 'equipier', n),
    ])
    expect(r.manques).toEqual([])
    expect(tenus(r)).toEqual(['e1', 'r1', 'r2'])
  })
})

describe('un niveau « jamais seul »', () => {
  const n = lireNiveaux([
    niv('titulaire', 'Titulaire', 0),
    niv('junior', 'Junior', 1, true, true),
    niv('soutien', 'Soutien', 2, false, true),
  ])
  it('ne tient jamais une place seul, même autonome', () => {
    const p = probleme({
      creneaux: [place()],
      salaries: [qui('j', 'junior', n)],
      graine: 1,
    })
    const r = generer(p, highs)
    expect(tenus(r)).toEqual([])
    // Posé quand même (à la main) : le vérificateur le dit.
    expect(
      soutiensSeuls(p, [{ salarieId: 'j', creneauId: 'p' }]).map(
        (v) => v.message,
      ),
    ).toEqual(['Junior sur ce poste : ne peut pas être seul'])
  })
  it('vient avec une personne qui ne l’est pas', () => {
    const p = probleme({
      creneaux: [place({ effectif: 2 })],
      salaries: [qui('j', 'junior', n), qui('t', 'titulaire', n)],
      graine: 1,
    })
    expect(tenus(generer(p, highs))).toEqual(['j', 't'])
    expect(
      soutiensSeuls(p, [
        { salarieId: 'j', creneauId: 'p' },
        { salarieId: 't', creneauId: 'p' },
      ]),
    ).toEqual([])
  })
  it('deux « jamais seuls » ne s’accompagnent pas', () => {
    const p = probleme({
      creneaux: [place({ effectif: 2 })],
      salaries: [qui('j', 'junior', n), qui('k', 'junior', n)],
      graine: 1,
    })
    expect(tenus(generer(p, highs))).toEqual([])
  })
  it('un niveau non autonome qui peut être seul : la case décide', () => {
    const libre = lireNiveaux([
      niv('titulaire', 'Titulaire', 0),
      niv('stage', 'Stage', 1, false, false),
    ])
    const p = probleme({
      creneaux: [place({ effectif: 0, soutien: 1 })],
      salaries: [qui('s', 'stage', libre)],
      graine: 1,
    })
    expect(soutiensSeuls(p, [{ salarieId: 's', creneauId: 'p' }])).toEqual([])
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
  const niveaux = [
    niv('responsable', 'Responsable', 0),
    niv('equipier', 'Équipier', 1),
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
      { niveau: 'responsable', nombre: 1 },
      { niveau: 'equipier', nombre: 2 },
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
      niveaux,
    },
    absences: [],
    affectations: salaries.map((s, i) => shift(50 + i, s.id)),
    avant: [],
    apres: [],
  })
  const manque = (salaries: Salarie[]) =>
    analyser(donnees(salaries)).a_pourvoir.find((a) => a.besoin_id === 10)
      ?.manquant ?? 0

  it('trois équipiers posés : la place du responsable reste à pourvoir', () => {
    // Le troisième prend le renfort, pas la place du responsable.
    expect(
      manque([
        salarie(1, 'equipier'),
        salarie(2, 'equipier'),
        salarie(3, 'equipier'),
      ]),
    ).toBe(1)
  })
  it('un responsable et deux équipiers : rien à pourvoir', () => {
    expect(
      manque([
        salarie(3, 'equipier'),
        salarie(1, 'responsable'),
        salarie(2, 'equipier'),
      ]),
    ).toBe(0)
  })
})

describe('aucune clé de niveau lue par le code (lot 2, A7)', () => {
  const RACINES = ['src/lib/planning', 'src/components/planning']
  const fichiers = (dir: string): string[] =>
    readdirSync(dir).flatMap((nom) => {
      const p = join(dir, nom)
      if (statSync(p).isDirectory()) return nom === 'test' ? [] : fichiers(p)
      return /\.(ts|tsx)$/.test(nom) && !/\.test\.tsx?$/.test(nom) ? [p] : []
    })
  it('plus de « titulaire », « occasionnel », « depannage », « soutien » écrits', () => {
    const trouves = RACINES.flatMap(fichiers)
      // Les niveaux de l'hôtel par défaut (mêmes lignes que la migration).
      .filter(
        (p) => !p.replaceAll('\\', '/').endsWith('lib/planning/niveaux.ts'),
      )
      .flatMap((p) =>
        readFileSync(p, 'utf8')
          .split('\n')
          .filter(
            (l) =>
              !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l) &&
              /['"`](?:titulaire|occasionnel|depannage|soutien)['"`]/.test(l) &&
              // La colonne `soutien` d'un besoin (et l'ancre de sa case),
              // pas un niveau.
              !/regler\(ligne, jour, 'soutien'|idCible\(cible, 'soutien'\)/.test(
                l,
              ),
          )
          .map((l) => `${p}: ${l.trim()}`),
      )
    expect(trouves).toEqual([])
  })
})

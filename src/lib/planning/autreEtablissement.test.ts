import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { zonesPassation } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import { avecMomentCalcule, momentPropose } from '#/lib/planning/moment.ts'
import { lireRegles } from '#/lib/planning/reglesEtablissement.ts'
import { momentsAvec } from '#/lib/planning/test/momentsTest.ts'
import { preparerGeneration } from '#/lib/planning/semaine.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { avecCode } from '#/lib/planning/test/codesTest.ts'
import { PlanningMemoire } from '#/lib/planning/test/planningMemoire.ts'
import type {
  Besoin,
  Consigne,
  Horaire,
  Niveau,
  Poste,
  Referentiel,
  Reglages,
  Salarie,
} from '#/lib/planning/types.ts'

/*
 * Étape 9 du plan `planning-moteur-configurable-2026-11-05` : un SECOND
 * établissement, fictif, qui n'est pas l'hôtel. Petit hôtel de jour : pas de
 * poste de nuit, contrats de 35 h en journées de 7 h seulement, deux repos de
 * suite seulement souhaités, 6 jours d'affilée conseillés, la nuit à partir
 * de 22 h et le matin jusqu’à 10 h, un Petit-déjeuner indispensable (poste
 * qui n’est pas l’accueil), une Direction non indispensable, un besoin
 * souhaité, un besoin « titulaire seulement », une fermeture à 22 h. Une
 * semaine générée : 0 infraction, les règles réglées tenues, et aucune règle
 * de l'hôtel par défaut qui s'applique quand elle est désactivée.
 * Pseudonymes seulement.
 */

const H = 60
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const LUNDI = '2026-11-16' // semaine sans jour férié
const AUJOURDHUI = '2026-11-01'
const TOUS = [0, 1, 2, 3, 4, 5, 6]

/** Les règles de cet établissement (le reste : les défauts). */
const REGLAGES: Reglages = {
  rythme_strict: false,
  deux_repos_de_suite: 'souhaite',
  jours_affiles_conseilles: 6,
  jour_isole: 'a_eviter',
  journees_contrats: [
    { minutes_hebdo: 35 * H, durees: [7 * H], courtes_max: 0 },
  ],
}

// Toutes de 7 h de travail (7 h 30 avec la pause).
const HORAIRES: Array<[number, string, string]> = [
  [1, '07:00', '14:30'], // matin
  [2, '14:30', '22:00'], // soir
  [3, '09:00', '16:30'], // matin ici, middle à l'hôtel
  [4, '09:30', '17:00'], // middle (Direction)
]

const RECEPTION = 1
const PDJ = 2
const DIRECTION = 3

const T: Niveau = 'titulaire'
const OC: Niveau = 'occasionnel'
const STAFF: Array<[string, Record<number, Niveau>]> = [
  ['Alix', { [RECEPTION]: T }],
  ['Bruno', { [RECEPTION]: T }],
  ['Chloé', { [RECEPTION]: T, [PDJ]: OC }],
  ['Dina', { [PDJ]: T, [RECEPTION]: OC, [DIRECTION]: OC }],
  ['Émile', { [PDJ]: T }],
  ['Fabien', { [DIRECTION]: T, [RECEPTION]: OC }],
]

const BESOIN_TITULAIRE = 100
const BESOIN_SOUHAITE = 200

/** Ses moments (2026-11-06 : la liste de l'établissement) : la nuit dès
 * 22 h, le soir dès 14 h ou jusqu'à 22 h, le matin avant 10 h et jusqu'à
 * 16 h 30. */
const MOMENTS_ETAB = momentsAvec({
  nuit: { debut_de: 22 * H, debut_a: 5 * H },
  soir: { debut_de: 14 * H, fin_de: 22 * H },
  matin: { debut_a: 10 * H, fin_a: 16 * H + 30 },
})

function etablissement(reglages: Reglages | undefined): Referentiel {
  const lignes = reglages ? MOMENTS_ETAB : undefined
  const moments = lireRegles({ reglages, moments: lignes }).moments
  // Comme `fetchReferentiel` : le moment se calcule d'après les heures et
  // les limites de l'établissement.
  // Le code d'essai se range APRÈS : une copie le perd (codesTest.ts).
  const horaires: Horaire[] = HORAIRES.map(([id, debut, fin]) =>
    avecCode<Horaire>(
      avecMomentCalcule(
        {
          id,
          nom: `${debut}`,
          debut,
          fin,
          couleur: '#888',
          pause: 30,
          periode: null,
        },
        moments,
      ),
      `H${id}`,
    ),
  )
  const postes: Poste[] = [
    {
      id: RECEPTION,
      nom: 'Réception',
      jour_max_minutes: 720,
      couleur: '#111',
      horaires_autorises: [1, 2, 3],
      zone_id: 1,
      ouverture: '07:00',
      fermeture: '22:00',
      indispensable: true,
    },
    {
      id: PDJ,
      nom: 'Petit-déjeuner',
      jour_max_minutes: 690,
      couleur: '#222',
      horaires_autorises: [1, 3],
      zone_id: null,
      indispensable: true,
    },
    {
      id: DIRECTION,
      nom: 'Direction',
      jour_max_minutes: 690,
      couleur: '#333',
      horaires_autorises: [4],
      zone_id: null,
      indispensable: false,
    },
  ]
  const h = (id: number) => horaires.find((x) => x.id === id)!
  const besoin = (
    id: number,
    poste: number,
    jour: number,
    horaire: number,
    kw: Partial<Besoin> = {},
  ): Besoin => ({
    id,
    poste_id: poste,
    jour,
    horaire_id: horaire,
    debut: h(horaire).debut,
    fin: h(horaire).fin,
    effectif: 1,
    soutien: 0,
    renfort: 0,
    ...kw,
  })
  const besoins: Besoin[] = [
    ...TOUS.map((j) =>
      besoin(BESOIN_TITULAIRE + j, PDJ, j, 1, { niveau_min: 'titulaire' }),
    ),
    ...[5, 6].map((j) =>
      besoin(BESOIN_SOUHAITE + j, PDJ, j, 3, { obligatoire: false }),
    ),
    ...[0, 1, 2, 3, 4].map((j) => besoin(300 + j, DIRECTION, j, 4)),
  ]
  const consignes: Consigne[] = TOUS.flatMap((jour) =>
    (['matin', 'soir'] as const).map((periode, k) => ({
      id: 2 * jour + k + 1,
      jour,
      periode,
      minimum: 1,
      maximum: 1,
    })),
  )
  const salaries: Salarie[] = STAFF.map(([prenom, competences], i) => ({
    id: i + 1,
    prenom,
    nom: 'Essai',
    groupe_id: null,
    type_contrat: 'cdi',
    heures_hebdo: 35,
    forfait_jours: false,
    mineur: false,
    competences: Object.entries(competences).map(([p, niveau]) => ({
      poste_id: Number(p),
      niveau,
    })),
    semaine_type: TOUS.map(() => ({ mode: 'auto' as const })),
    shifts_autorises: [],
    date_entree: null,
    date_sortie: null,
    actif: true,
    suite_de: null,
  }))
  return {
    horaires,
    motifs: [],
    postes,
    groupes: [],
    salaries,
    besoins,
    consignes,
    verrous: [],
    ...(reglages ? { reglages, moments: MOMENTS_ETAB } : {}),
  }
}

const planning = (reglages: Reglages | undefined) =>
  new PlanningMemoire(etablissement(reglages), [], AUJOURDHUI, highs)

const alertesDe = (sem: SemaineOut, regle: string) =>
  sem.bilan.flatMap((b) => b.alertes).filter((a) => a.regle === regle)

describe('un second établissement, fictif', () => {
  let sem: SemaineOut
  let p: PlanningMemoire
  beforeAll(() => {
    p = planning(REGLAGES)
    sem = p.generer(LUNDI, { horizon: { suivanteRecalculee: false } })
  }, 60_000)

  it('génère une semaine sans infraction ni place obligatoire vide', () => {
    expect(sem.affectations.length).toBeGreaterThan(20)
    expect(sem.stats.infractions).toBe(0)
    for (const a of sem.affectations)
      expect(a.alertes.filter((x) => x.nature === 'loi')).toEqual([])
    expect(sem.a_pourvoir).toEqual([])
    // Ouverture et fermeture de la Réception tenues, aucun trou.
    expect(sem.trous).toEqual([])
  })

  it('journées de 7 h seulement', () => {
    for (const a of sem.affectations) expect(a.duree).toBe(7 * H)
  })

  it('titulaire seulement : laissé vide plutôt que tenu en dépannage', () => {
    // Sans Émile, Dina est la seule titulaire (5 journées pour 7 places) ;
    // Chloé pourrait dépanner, la place le refuse.
    const q = planning(REGLAGES)
    q.referentiel = {
      ...q.referentiel,
      salaries: q.referentiel.salaries.filter((s) => s.prenom !== 'Émile'),
    }
    const s = q.generer(LUNDI)
    const dina = q.salarie('Dina').id
    const titulaire = (id: number) =>
      id >= BESOIN_TITULAIRE && id < BESOIN_TITULAIRE + 7
    for (const a of s.affectations)
      if (a.besoin_id !== null && titulaire(a.besoin_id))
        expect(a.salarie_id).toBe(dina)
    const vides = s.a_pourvoir.filter((a) => titulaire(a.besoin_id))
    expect(vides).toHaveLength(2)
    const chloe = q.salarie('Chloé').id
    for (const v of vides)
      expect(
        v.raisons.find((r) => r.salarie_id === chloe)?.regles ?? [],
      ).toContain('TITULAIRE-DEMANDE')
    expect(s.stats.infractions).toBe(0)
  }, 60_000)

  it('titulaire seulement : tenu par un titulaire du poste', () => {
    const titulaires = new Set(
      p.referentiel.salaries
        .filter((s) =>
          s.competences.some((c) => c.poste_id === PDJ && c.niveau === T),
        )
        .map((s) => s.id),
    )
    const tenus = sem.affectations.filter(
      (a) =>
        a.besoin_id !== null &&
        a.besoin_id >= BESOIN_TITULAIRE &&
        a.besoin_id < BESOIN_TITULAIRE + 7,
    )
    expect(tenus).toHaveLength(7)
    for (const a of tenus) expect(titulaires.has(a.salarie_id)).toBe(true)
  })

  it('aucune passation avec un veilleur : pas de nuit ici', () => {
    const g = preparerGeneration(p.donnees(LUNDI), { aujourdhui: AUJOURDHUI })
    expect(zonesPassation(g.probleme)).toEqual([])
    for (const t of sem.transmissions ?? []) {
      expect(t.nuitMatin).toBeNull()
      expect(t.soirNuit).toBeNull()
    }
    // La passation avec la nuit est fixe (2026-11-06) ; aucun poste ne tient
    // la nuit : aucune zone de passation.
    const q = planning(REGLAGES)
    const g2 = preparerGeneration(q.donnees(LUNDI), { aujourdhui: AUJOURDHUI })
    expect(zonesPassation(g2.probleme)).toEqual([])
  })

  it('moments selon les limites de l’établissement', () => {
    const moments = lireRegles({
      reglages: REGLAGES,
      moments: MOMENTS_ETAB,
    }).moments
    const h3 = { debut: '09:00', fin: '16:30', pause: 30 }
    expect(momentPropose(h3, moments)).toBe('matin')
    expect(momentPropose(h3)).toBe('middle')
    const tard = { debut: '21:30', fin: '23:30', pause: 0 }
    expect(momentPropose(tard, moments)).toBe('soir')
    expect(momentPropose(tard)).toBe('nuit')
    // Le 09:00-16:30 de la Réception compte pour le matin de l'accueil.
    const g = preparerGeneration(p.donnees(LUNDI), { aujourdhui: AUJOURDHUI })
    const c = g.probleme.creneaux.filter(
      (x) => x.poste === String(RECEPTION) && x.typeShift === '3',
    )
    expect(c.length).toBeGreaterThan(0)
    for (const x of c) expect(x.presence).toEqual(['matin'])
  })

  it('il manque du monde : la Direction, non indispensable, reste vide en premier', () => {
    // Sans Fabien : 25 journées pour 26 places obligatoires. Dina pourrait
    // tenir la Direction en dépannage, mais la Réception et le
    // Petit-déjeuner passent devant.
    const q = planning(REGLAGES)
    q.referentiel = {
      ...q.referentiel,
      salaries: q.referentiel.salaries.filter((s) => s.prenom !== 'Fabien'),
    }
    const s = q.generer(LUNDI)
    expect(s.a_pourvoir.length).toBeGreaterThan(0)
    for (const a of s.a_pourvoir) expect(a.poste_id).toBe(DIRECTION)
    // Le besoin souhaité vide n'est jamais une place à pourvoir.
    expect(
      s.a_pourvoir.filter(
        (a) => a.besoin_id >= BESOIN_SOUHAITE && a.besoin_id < 300,
      ),
    ).toEqual([])
    expect(s.stats.infractions).toBe(0)
  }, 60_000)
})

describe('les règles de l’hôtel ne s’appliquent pas quand elles sont réglées autrement', () => {
  // Une semaine posée à la main : 6 jours d'affilée (lundi à samedi), puis
  // une autre personne aux repos séparés (mardi et jeudi) et un jour seul.
  const poser = (reglages: Reglages | undefined) => {
    const p = planning(reglages)
    for (const j of [0, 1, 2, 3, 4, 5])
      p.poser(LUNDI, 1, RECEPTION, j, { code: 'H1' })
    // Bruno : lundi, mercredi, vendredi, samedi, dimanche (repos mardi et
    // jeudi, mercredi seul entre deux repos).
    let sem: SemaineOut | null = null
    for (const j of [0, 2, 4, 5, 6])
      sem = p.poser(LUNDI, 2, RECEPTION, j, { code: 'H2' })
    return sem!
  }
  const alertesDeQui = (sem: SemaineOut, qui: number, regle: string) =>
    (sem.bilan.find((b) => b.salarie_id === qui)?.alertes ?? []).filter(
      (a) => a.regle === regle,
    )

  it('6 jours d’affilée : dits à l’hôtel (5 conseillés), pas ici (6)', () => {
    // À l'hôtel, le rythme 5 et 2 strict le dit (2026-11-09) ; sans lui,
    // les jours d'affilée conseillés.
    expect(alertesDeQui(poser(undefined), 1, 'RYTHME-5-2')).not.toEqual([])
    expect(
      alertesDeQui(poser({ rythme_strict: false }), 1, 'JOURS-AFFILES'),
    ).not.toEqual([])
    expect(alertesDeQui(poser(REGLAGES), 1, 'JOURS-AFFILES')).toEqual([])
    expect(alertesDeQui(poser(REGLAGES), 1, 'RYTHME-5-2')).toEqual([])
  })

  it('repos séparés et jour isolé : interdits à l’hôtel, rien quand la règle est retirée', () => {
    const hotel = poser(undefined)
    expect(alertesDeQui(hotel, 2, 'REPOS-SEPARES')).not.toEqual([])
    expect(alertesDeQui(hotel, 2, 'JOUR-ISOLE')).not.toEqual([])
    const sans = poser({
      ...REGLAGES,
      deux_repos_de_suite: 'aucune',
      jour_isole: 'aucune',
    })
    expect(alertesDeQui(sans, 2, 'REPOS-SEPARES')).toEqual([])
    expect(alertesDeQui(sans, 2, 'JOUR-ISOLE')).toEqual([])
    expect(alertesDe(sans, 'REPOS-SEPARES')).toEqual([])
  })
})

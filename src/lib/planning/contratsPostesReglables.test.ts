import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Highs } from '#/lib/planning/generateur.ts'
import { avecMomentCalcule } from '#/lib/planning/moment.ts'
import {
  plafondHebdo,
  plafondJour,
  versSolveur,
} from '#/lib/planning/regles.ts'
import type { Fiche } from '#/lib/planning/regles.ts'
import {
  lireRegles,
  listeContrats,
  modeleDe,
  REGLES_PAR_DEFAUT,
} from '#/lib/planning/reglesEtablissement.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { avecCode } from '#/lib/planning/test/codesTest.ts'
import { PlanningMemoire } from '#/lib/planning/test/planningMemoire.ts'
import { presence } from '#/lib/planning/temps.ts'
import type {
  Besoin,
  Horaire,
  ModeleContrat,
  Poste,
  Referentiel,
  Reglages,
  Salarie,
} from '#/lib/planning/types.ts'

/*
 * Lot 1a du plan `planning-moteur-configurable-2026-11-05` (2026-11-06) :
 * types de contrat créés par l'établissement, durée max d'un service réglée
 * sur le poste. Aucun code de contrat ni catégorie n'est lu par le calcul.
 * Pseudonymes seulement.
 */

const H = 60
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const LUNDI = '2026-11-16'
const AUJOURDHUI = '2026-11-01'
const TOUS = [0, 1, 2, 3, 4, 5, 6]
const REGLAGES: Reglages = { releve_minutes: 0, passation_veilleur: false }

/** Les cinq contrats de l'hôtel, tels que la base les range. */
const LIGNES_HOTEL: ModeleContrat[] = listeContrats(REGLES_PAR_DEFAUT).map(
  (m) => ({
    type_contrat: m.code,
    nom: m.nom,
    ordre: m.ordre,
    jour_max_minutes: m.jourMaxMinutes,
    mineur_possible: m.mineurPossible,
    forfait_possible: m.forfaitPossible,
    fin_obligatoire: m.finObligatoire,
    journees_imposees: m.journeesImposees,
    journee_etoile: m.journeeEtoile,
    placement_manuel: m.placementManuel,
    contrat_indicatif: m.contratIndicatif,
    ferie_rattrape: m.ferieRattrape,
    feries_jour_meme: m.feriesJourMeme,
    alternance: m.alternance,
  }),
)

/** « Saisonnier », créé par l'établissement : mêmes cases que l'extra. */
const SAISONNIER: ModeleContrat = {
  ...LIGNES_HOTEL.find((m) => m.type_contrat === 'extra')!,
  type_contrat: 'contrat_1',
  nom: 'Saisonnier',
  ordre: 5,
}

function horaire(id: number, debut: string, fin: string, pause = 30) {
  return avecCode<Horaire>(
    avecMomentCalcule({
      id,
      nom: debut,
      debut,
      fin,
      couleur: '#888',
      pause,
      periode: null,
    }),
    `H${id}`,
  )
}

const salarie = (
  id: number,
  prenom: string,
  poste: number,
  kw: Partial<Salarie> = {},
): Salarie => ({
  id,
  prenom,
  nom: 'Essai',
  groupe_id: null,
  type_contrat: 'cdi',
  heures_hebdo: 35,
  forfait_jours: false,
  mineur: false,
  competences: [{ poste_id: poste, niveau: 'titulaire' }],
  semaine_type: TOUS.map(() => ({ mode: 'auto' as const })),
  shifts_autorises: [],
  date_entree: null,
  date_sortie: null,
  actif: true,
  suite_de: null,
  ...kw,
})

const besoin = (
  id: number,
  poste: number,
  jour: number,
  h: Horaire,
): Besoin => ({
  id,
  poste_id: poste,
  jour,
  horaire_id: h.id,
  debut: h.debut,
  fin: h.fin,
  effectif: 1,
  soutien: 0,
  renfort: 0,
})

describe('un contrat créé par l’établissement', () => {
  const MATIN = horaire(1, '07:00', '14:30')
  const SOIR = horaire(2, '14:30', '22:00')
  const ACCUEIL = 1

  function hotel(typeRenfort: string): Referentiel {
    const postes: Poste[] = [
      {
        id: ACCUEIL,
        nom: 'Accueil',
        jour_max_minutes: 720,
        couleur: '#111',
        horaires_autorises: [1, 2],
        zone_id: null,
        indispensable: true,
      },
    ]
    return {
      horaires: [MATIN, SOIR],
      motifs: [],
      postes,
      groupes: [],
      salaries: [
        salarie(1, 'Alix', ACCUEIL),
        salarie(2, 'Bruno', ACCUEIL),
        // Le renfort, d'un contrat placé à la main.
        salarie(3, 'Chloé', ACCUEIL, {
          type_contrat: typeRenfort,
          heures_hebdo: 0,
        }),
      ],
      besoins: TOUS.flatMap((j) => [
        besoin(10 + j, ACCUEIL, j, MATIN),
        besoin(20 + j, ACCUEIL, j, SOIR),
      ]),
      consignes: [],
      verrous: [],
      reglages: REGLAGES,
      modelesContrat: [...LIGNES_HOTEL, SAISONNIER],
    }
  }

  const resume = (s: SemaineOut) =>
    s.affectations
      .map((a) => `${a.salarie_id}|${a.poste_id}|${a.jour}|${a.debut}`)
      .sort()

  it('« Saisonnier » au placement à la main se comporte comme un extra', () => {
    const extra = new PlanningMemoire(hotel('extra'), [], AUJOURDHUI, highs)
    const saisonnier = new PlanningMemoire(
      hotel('contrat_1'),
      [],
      AUJOURDHUI,
      highs,
    )
    const a = extra.generer(LUNDI, { graine: 7 })
    const b = saisonnier.generer(LUNDI, { graine: 7 })
    // Jamais placé par le calcul, comme l'extra : même planning.
    expect(b.affectations.some((x) => x.salarie_id === 3)).toBe(false)
    expect(resume(b)).toEqual(resume(a))
    expect(b.a_pourvoir.length).toBe(a.a_pourvoir.length)
    // Posé à la main : mêmes plafonds que l'extra (48 h, pas d'heures dues).
    const r = lireRegles(hotel('contrat_1'))
    const fiche = (typeContrat: string): Fiche => ({
      id: '3',
      postes: new Set(['1']),
      typeContrat,
      minutesHebdo: 0,
      regles: r,
    })
    const { id: _a, ...sExtra } = versSolveur(fiche('extra'))
    const { id: _b, ...sSaison } = versSolveur(fiche('contrat_1'))
    expect(sSaison).toEqual(sExtra)
    expect(plafondHebdo(fiche('contrat_1'))).toBe(48 * H)
  }, 60_000)

  it('refusé : sans la case « posé à la main », il est placé', () => {
    const ref = hotel('contrat_1')
    ref.modelesContrat = [
      ...LIGNES_HOTEL,
      { ...SAISONNIER, placement_manuel: false, contrat_indicatif: false },
    ]
    ref.salaries[2].heures_hebdo = 35
    const s = new PlanningMemoire(ref, [], AUJOURDHUI, highs).generer(LUNDI, {
      graine: 7,
    })
    expect(s.affectations.some((x) => x.salarie_id === 3)).toBe(true)
  }, 60_000)

  it('son nom et son ordre viennent de la base, la liste aussi', () => {
    const r = lireRegles({ modelesContrat: [...LIGNES_HOTEL, SAISONNIER] })
    expect(listeContrats(r).map((m) => m.nom)).toEqual([
      'CDI',
      'CDD',
      'Extra',
      'Stagiaire',
      'Apprenti',
      'Saisonnier',
    ])
    // Un contrat retiré de la base n'est plus dans la liste.
    const sans = lireRegles({
      modelesContrat: LIGNES_HOTEL.filter((m) => m.type_contrat !== 'cdd'),
    })
    expect(listeContrats(sans).map((m) => m.code)).not.toContain('cdd')
  })

  it('la durée max d’un jour se lit dans le modèle (le stagiaire : 10 h)', () => {
    const r = lireRegles({ modelesContrat: [...LIGNES_HOTEL, SAISONNIER] })
    const fiche = (typeContrat: string, rr = r): Fiche => ({
      id: 'x',
      postes: new Set(),
      typeContrat,
      minutesHebdo: 35 * H,
      regles: rr,
    })
    expect(plafondJour(fiche('stagiaire'))).toBe(10 * H)
    expect(plafondJour(fiche('cdi'))).toBe(12 * H)
    const neuf = lireRegles({
      modelesContrat: [
        ...LIGNES_HOTEL,
        { ...SAISONNIER, jour_max_minutes: 9 * H },
      ],
    })
    expect(plafondJour(fiche('contrat_1', neuf))).toBe(9 * H)
    // Jamais au-delà de la loi.
    const trop = lireRegles({
      modelesContrat: [{ ...SAISONNIER, jour_max_minutes: 14 * H }],
    })
    expect(plafondJour(fiche('contrat_1', trop))).toBe(12 * H)
  })

  it('mineur, forfait et fin obligatoire : les cases du modèle', () => {
    const m = REGLES_PAR_DEFAUT.modeles
    expect(m.apprenti.mineurPossible && m.stagiaire.mineurPossible).toBe(true)
    expect(m.cdi.mineurPossible || m.cdd.mineurPossible).toBe(false)
    expect(m.cdi.forfaitPossible && m.cdd.forfaitPossible).toBe(true)
    expect(
      m.extra.forfaitPossible ||
        m.apprenti.forfaitPossible ||
        m.stagiaire.forfaitPossible,
    ).toBe(false)
    expect(
      [m.cdd, m.apprenti, m.stagiaire].every((x) => x.finObligatoire),
    ).toBe(true)
    expect(m.cdi.finObligatoire || m.extra.finObligatoire).toBe(false)
    expect(modeleDe(REGLES_PAR_DEFAUT, 'inconnu').placementManuel).toBe(false)
  })
})

describe('un poste neuf à 10 h de service au plus', () => {
  const BAGAGERIE = 1
  // 10 h et 10 h 30 de présence (pause de 30 min comprise).
  const DIX = horaire(1, '08:00', '18:00')
  const DIX_ET_DEMI = horaire(2, '08:00', '18:30')

  function hotel(jourMax: number): Referentiel {
    return {
      horaires: [DIX, DIX_ET_DEMI],
      motifs: [],
      postes: [
        {
          id: BAGAGERIE,
          nom: 'Bagagerie',
          jour_max_minutes: jourMax,
          couleur: '#111',
          horaires_autorises: [1, 2],
          zone_id: null,
          indispensable: true,
        },
      ],
      groupes: [],
      // Contrat de 30 h : aucune journée imposée, le calcul fait au mieux.
      salaries: [1, 2, 3, 4].map((i) =>
        salarie(i, `P${i}`, BAGAGERIE, { heures_hebdo: 30 }),
      ),
      besoins: TOUS.flatMap((j) => [
        besoin(10 + j, BAGAGERIE, j, DIX),
        besoin(20 + j, BAGAGERIE, j, DIX_ET_DEMI),
      ]),
      consignes: [],
      verrous: [],
      reglages: REGLAGES,
    }
  }

  it('n’a jamais de service de plus de 10 h', () => {
    const s = new PlanningMemoire(hotel(10 * H), [], AUJOURDHUI, highs).generer(
      LUNDI,
      { graine: 3 },
    )
    const sur = s.affectations.filter((a) => a.poste_id === BAGAGERIE)
    expect(sur.length).toBeGreaterThan(0)
    for (const a of sur)
      expect(presence(a.debut, a.fin)).toBeLessThanOrEqual(10 * H)
    // Le besoin de 10 h 30 est écarté, avec la raison.
    expect(s.alertes_besoins.map((a) => a.besoin_id).sort()).toEqual(
      TOUS.map((j) => 20 + j),
    )
    expect(s.alertes_besoins[0].message).toMatch(
      /durée maximale d'un service sur ce poste \(10 h 00/,
    )
  }, 60_000)

  it('refusé : à 12 h, le même poste tient le service de 10 h 30', () => {
    const s = new PlanningMemoire(hotel(12 * H), [], AUJOURDHUI, highs).generer(
      LUNDI,
      { graine: 3 },
    )
    expect(s.alertes_besoins).toEqual([])
    expect(s.affectations.some((a) => presence(a.debut, a.fin) > 10 * H)).toBe(
      true,
    )
  }, 60_000)
})

describe('aucun code de contrat ni catégorie lu par le code (lot 1a)', () => {
  const RACINES = ['src/lib/planning', 'src/components/planning']
  const fichiers = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) return n === 'test' ? [] : fichiers(p)
      return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []
    })
  const sources = RACINES.flatMap(fichiers).map((p) => ({
    p,
    texte: readFileSync(p, 'utf8'),
  }))
  const CODE = '[\'"](?:extra|stagiaire|apprenti|cdi|cdd)[\'"]'

  it('aucune comparaison à un code de contrat', () => {
    const motifs = [
      new RegExp(`(?:===|!==|==|!=)\\s*${CODE}`),
      new RegExp(`${CODE}\\s*(?:===|!==|==|!=)`),
      new RegExp(`case\\s+${CODE}`),
      new RegExp(`new Set\\(\\[[^\\]]*${CODE}`),
      new RegExp(`\\.(?:has|includes)\\(\\s*${CODE}`),
    ]
    const trouves = sources.flatMap(({ p, texte }) =>
      texte
        .split('\n')
        .filter((l) => motifs.some((m) => m.test(l)))
        .map((l) => `${p}: ${l.trim()}`),
    )
    expect(trouves).toEqual([])
  })

  it('la catégorie d’un poste n’est plus lue', () => {
    const trouves = sources.flatMap(({ p, texte }) =>
      texte
        .split('\n')
        .filter((l) => /\.categorie\b|categorie:/.test(l))
        .map((l) => `${p}: ${l.trim()}`),
    )
    expect(trouves).toEqual([])
  })

  it('le nom d’un groupe ne décide plus du forfait jours', () => {
    const trouves = sources.filter(({ texte }) =>
      /estDirection|=== 'direction'/.test(texte),
    )
    expect(trouves.map((x) => x.p)).toEqual([])
  })

  // Lot 1b (2026-11-06) : motifs, libellés métier, importance, week-end.
  /** Les lignes de code (hors commentaires) qui répondent à `re`. */
  const lignes = (re: RegExp, exclus: readonly string[] = []) =>
    sources
      .filter(
        ({ p }) => !exclus.some((e) => p.replaceAll('\\', '/').endsWith(e)),
      )
      .flatMap(({ p, texte }) =>
        texte
          .split('\n')
          .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l) && re.test(l))
          .map((l) => `${p}: ${l.trim()}`),
      )

  it('aucun code de motif écrit dans le code (CP, JF, JFR, EC…)', () => {
    expect(lignes(/['"`](?:CP|JF|JFR|EC|RF|RP|RJ|MA|FO|SS|R)['"`]/)).toEqual([])
  })

  it('aucun nom de motif ne décide de rien (forfait, école)', () => {
    expect(
      lignes(/\.(?:includes|startsWith)\(\s*['"](?:forfait|ecole|école)['"]/),
    ).toEqual([])
  })

  it('aucun libellé métier ni nom de poste écrit dans le code', () => {
    expect(
      lignes(
        /Veilleur|Hôtelier|hôtelier|Réception|\bClub\b|Veille de nuit|Direction|Supervision|Adjoint/,
        [
          // Le seul nom d'un réglage de la base, pas un libellé.
          'reglesEtablissement.ts',
        ],
      ).filter((l) => !/passations?Veilleur|passation_veilleur/.test(l)),
    ).toEqual([])
  })

  it('l’importance d’un poste n’est plus lue : la case indispensable', () => {
    expect(lignes(/\.importance\b|importance:/)).toEqual([])
  })

  it('aucun moment écrit dans le code (matin, soir, nuit, middle, lot 2)', () => {
    expect(
      lignes(/(?<!Anchor=)['"`](?:matin|soir|nuit|middle)['"`]/, [
        // Les moments de l'hôtel par défaut (mêmes lignes que la migration).
        'lib/planning/moment.ts',
      ]),
    ).toEqual([])
  })

  it('la zone d’un poste remplace presence et accueil_nuit (lot 2, A5)', () => {
    expect(
      lignes(
        /accueil_nuit|\b(?:p|poste|x|vise)\??\.presence\b(?!\s*[.)])|NOM_ZONE_ACCUEIL/,
      ),
    ).toEqual([])
  })

  // Les trois niveaux FIXES (décision de l'utilisateur du 2026-11-06) :
  // leurs clés ne s'écrivent que dans `niveaux.ts`, la seule source.
  it('les clés de niveau ne s’écrivent que dans niveaux.ts', () => {
    expect(
      lignes(/['"`](?:titulaire|occasionnel|depannage|soutien)['"`]/, [
        'lib/planning/niveaux.ts',
      ]).filter(
        // La colonne `soutien` d'un besoin (et l'ancre de sa case), pas un
        // niveau.
        (l) =>
          !/regler\(ligne, jour, 'soutien'|idCible\(cible, 'soutien'\)/.test(l),
      ),
    ).toEqual([])
  })

  it('les jours du week-end viennent des règles', () => {
    expect(
      lignes(/\[5, ?6\]|jour >= 5|jourDe\(c\) >= 5|has\(5\) \|\||j !== 5/, [
        // Les défauts de l'établissement.
        'reglesEtablissement.ts',
        // « Appliquer à samedi et dimanche » : le calendrier, pas le
        // week-end de l'établissement.
        'besoins/historique.ts',
      ]),
    ).toEqual([])
  })
})

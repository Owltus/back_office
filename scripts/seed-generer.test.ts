// Tests du générateur de seed local (supabase/seed/generer.ts).
// Placés ici et non à côté du générateur : vite.config.ts exclut `supabase/**`
// de Vitest (les tests Deno des Edge Functions y vivent).
//
// Oracles écrits À LA MAIN depuis le schéma (supabase/migrations/…baseline.sql),
// jamais recopiés du générateur : liste des clés étrangères, contraintes
// d'unicité, fenêtre de dates.

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { fc, test } from '@fast-check/vitest'

import {
  CHAMBRES,
  COMPTES,
  FOND_CENTIMES,
  colonne,
  extraireInstruction,
  fenetreDe,
  genererDonnees,
  genererSeed,
  lireReferentiels,
  pdjInclus,
  trouverTable,
  versIso,
  versJour,
} from '../supabase/seed/generer.ts'
import type { Donnees, Table, Val } from '../supabase/seed/generer.ts'

const RACINE_SUPABASE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'supabase',
)
const REFERENTIELS = lireReferentiels(RACINE_SUPABASE)
const JOUR = '2026-10-13'

// Une date entre 2024 et 2030, au format ISO.
const arbDate = fc
  .integer({ min: versJour('2024-01-01'), max: versJour('2030-12-31') })
  .map(versIso)
const arbGraine = fc.integer({ min: 0, max: 0xffffffff })
const RUNS = { numRuns: 8 }
// Chaque cas génère 90 jours d'hôtel (~75 ms) : marge large sur un poste chargé.
vi.setConfig({ testTimeout: 60_000 })

const cache = new Map<string, Donnees>()
function donnees(aujourdhui: string, graine: number): Donnees {
  const cle = `${aujourdhui}#${graine}`
  let d = cache.get(cle)
  if (!d) {
    d = genererDonnees({ aujourdhui, graine })
    cache.set(cle, d)
  }
  return d
}

function lignes(t: Table): Array<Record<string, Val>> {
  return t.lignes.map((l) =>
    Object.fromEntries(t.colonnes.map((c, i) => [c, l[i]])),
  )
}

// ---------------------------------------------------------------------------
// Oracle : clés étrangères du schéma (baseline), table → [colonne, cible]
// ---------------------------------------------------------------------------
const FK: ReadonlyArray<readonly [string, string, string]> = [
  ['public.profiles', 'id', 'auth.users'],
  ['auth.identities', 'user_id', 'auth.users'],
  ['public.user_page_permissions', 'user_id', 'public.profiles'],
  ['public.user_page_permissions', 'updated_by', 'public.profiles'],
  ['public.daily_reports', 'imported_by', 'public.profiles'],
  ['public.baby_cot_assignments', 'cot_id', 'public.baby_cots'],
  ['public.baby_cot_assignments', 'created_by', 'public.profiles'],
  ['public.caisse_cautions', 'created_by', 'public.profiles'],
  ['public.caisse_cautions', 'refunded_by', 'auth.users'],
  ['public.caisse_sheets', 'created_by', 'public.profiles'],
  ['public.caisse_sheets', 'validated_by', 'public.profiles'],
  ['public.classeur_acces', 'classeur_id', 'public.classeur_classeurs'],
  ['public.classeur_acces', 'user_id', 'public.profiles'],
  ['public.classeur_acces', 'created_by', 'public.profiles'],
  ['public.classeur_chapters', 'classeur_id', 'public.classeur_classeurs'],
  ['public.classeur_chapters', 'created_by', 'public.profiles'],
  ['public.classeur_classeurs', 'created_by', 'public.profiles'],
  [
    'public.classeur_document_versions',
    'classeur_id',
    'public.classeur_classeurs',
  ],
  [
    'public.classeur_document_versions',
    'document_id',
    'public.classeur_documents',
  ],
  ['public.classeur_document_versions', 'created_by', 'public.profiles'],
  ['public.classeur_documents', 'chapter_id', 'public.classeur_chapters'],
  ['public.classeur_documents', 'created_by', 'public.profiles'],
  ['public.classeur_intercalaires', 'chapter_id', 'public.classeur_chapters'],
  [
    'public.classeur_signature_sheets',
    'chapter_id',
    'public.classeur_chapters',
  ],
  ['public.classeur_tracking_sheets', 'chapter_id', 'public.classeur_chapters'],
  ['public.literie_sheets', 'created_by', 'public.profiles'],
  ['public.literie_sheets', 'validated_by', 'public.profiles'],
  ['public.literie_stock_movements', 'created_by', 'public.profiles'],
  ['public.literie_stock_movements', 'room', 'public.hotel_rooms'],
  ['public.rapro_rooms', 'created_by', 'public.profiles'],
  ['public.rapro_sheets', 'created_by', 'public.profiles'],
  ['public.rapro_sheets', 'validated_by', 'public.profiles'],
]

/** Clé primaire (ou colonne visée) de chaque table cible. */
const CIBLE: Record<string, string> = {
  'auth.users': 'id',
  'public.profiles': 'id',
  'public.baby_cots': 'id',
  'public.classeur_classeurs': 'id',
  'public.classeur_chapters': 'id',
  'public.classeur_documents': 'id',
}

function valeursCible(d: Donnees, cible: string): Set<Val> {
  // hotel_rooms vient du référentiel du dépôt (generate_series de literie.sql).
  if (cible === 'public.hotel_rooms') return new Set(CHAMBRES)
  return new Set(colonne(trouverTable(d, cible), CIBLE[cible]))
}

/** Colonnes de type `date` des tables générées (oracle : baseline). */
const COLONNES_DATE = new Set([
  'date',
  'service_date',
  'report_date',
  'start_date',
  'end_date',
  'taken_date',
  'refunded_date',
  'arrival_date',
  'departure_date',
  'effective_from',
  'cycle_date',
])

// ---------------------------------------------------------------------------

describe('déterminisme', () => {
  it('même graine et même date → même SQL, octet pour octet', () => {
    const a = genererSeed({ aujourdhui: JOUR }, REFERENTIELS)
    const b = genererSeed({ aujourdhui: JOUR }, REFERENTIELS)
    expect(a).toBe(b)
  })

  test.prop([arbGraine, arbDate], { numRuns: 4 })(
    'déterministe pour toute graine et toute date',
    (g, j) => {
      const a = genererSeed({ aujourdhui: j, graine: g }, REFERENTIELS)
      const b = genererSeed({ aujourdhui: j, graine: g }, REFERENTIELS)
      expect(a).toBe(b)
    },
  )

  it('une autre graine change les données', () => {
    const a = genererSeed({ aujourdhui: JOUR, graine: 1 }, REFERENTIELS)
    const b = genererSeed({ aujourdhui: JOUR, graine: 2 }, REFERENTIELS)
    expect(a).not.toBe(b)
  })

  it('ne dépend pas de Math.random', () => {
    const original = Math.random
    Math.random = () => {
      throw new Error('Math.random appelé')
    }
    try {
      expect(() =>
        genererDonnees({ aujourdhui: '2026-03-01', graine: 99 }),
      ).not.toThrow()
    } finally {
      Math.random = original
    }
  })
})

describe('fenêtre de 90 jours', () => {
  it('va de J-75 à J+14', () => {
    const f = fenetreDe(JOUR)
    expect(versIso(f.debut)).toBe('2026-07-30')
    expect(versIso(f.fin)).toBe('2026-10-27')
    expect(f.fin - f.debut + 1).toBe(90)
  })

  test.prop([arbGraine, arbDate], RUNS)(
    'toute colonne de date tombe dans la fenêtre',
    (g, j) => {
      const d = donnees(j, g)
      const { debut, fin } = d.fenetre
      const ko: string[] = []
      let vues = 0
      for (const t of d.tables) {
        t.colonnes.forEach((c, i) => {
          if (!COLONNES_DATE.has(c)) return
          for (const l of t.lignes) {
            const v = l[i]
            if (v === null) continue
            vues++
            if (typeof v !== 'string') {
              ko.push(`${t.nom}.${c} non texte`)
              continue
            }
            const jour = versJour(v)
            if (jour < debut || jour > fin) ko.push(`${t.nom}.${c} = ${v}`)
          }
        })
      }
      expect(ko.slice(0, 5)).toEqual([])
      expect(vues).toBeGreaterThan(1000)
    },
  )

  test.prop([arbGraine, arbDate], RUNS)(
    'aucun rapport ni service PDJ dans le futur',
    (g, j) => {
      const d = donnees(j, g)
      const auj = d.fenetre.aujourdhui
      for (const v of colonne(
        trouverTable(d, 'public.daily_reports'),
        'date',
      )) {
        expect(versJour(v as string)).toBeLessThan(auj)
      }
      for (const v of colonne(
        trouverTable(d, 'public.pdj_breakfasts'),
        'service_date',
      )) {
        expect(versJour(v as string)).toBeLessThanOrEqual(auj)
      }
    },
  )
})

describe('parking', () => {
  test.prop([arbGraine, arbDate], RUNS)(
    'aucun chevauchement sur une même place (parking_reservations_no_overlap)',
    (g, j) => {
      const r = lignes(
        trouverTable(donnees(j, g), 'public.parking_reservations'),
      )
      expect(r.length).toBeGreaterThan(50)
      const parPlace = new Map<number, Array<[number, number]>>()
      for (const x of r) {
        const place = x.spot as number
        expect(place).toBeGreaterThanOrEqual(1)
        expect(place).toBeLessThanOrEqual(14)
        expect(x.nights as number).toBeGreaterThanOrEqual(1)
        const debut = versJour(x.start_date as string)
        const l = parPlace.get(place) ?? []
        l.push([debut, debut + (x.nights as number)]) // [début, fin)
        parPlace.set(place, l)
      }
      for (const [place, l] of parPlace) {
        l.sort((a, b) => a[0] - b[0])
        for (let i = 1; i < l.length; i++) {
          expect(l[i][0], `place ${place}`).toBeGreaterThanOrEqual(l[i - 1][1])
        }
      }
    },
  )

  test.prop([arbGraine, arbDate], RUNS)(
    'le départ ne dépasse pas la fenêtre',
    (g, j) => {
      const d = donnees(j, g)
      for (const x of lignes(trouverTable(d, 'public.parking_reservations'))) {
        expect(
          versJour(x.start_date as string) + (x.nights as number),
        ).toBeLessThanOrEqual(d.fenetre.fin)
      }
    },
  )
})

describe('petit-déjeuner', () => {
  test.prop([arbGraine, arbDate], RUNS)(
    'cases plafonnées à 2 et règle des inclus respectée',
    (g, j) => {
      const r = lignes(trouverTable(donnees(j, g), 'public.pdj_breakfasts'))
      expect(r.length).toBeGreaterThan(3000)
      const ko: string[] = []
      const vus = new Set<string>()
      const chambres = new Set(CHAMBRES)
      for (const x of r) {
        const cle = `${x.service_date}#${x.room}`
        for (const c of [
          'breakfasts_included',
          'breakfasts_served',
          'breakfasts_offert',
        ]) {
          const n = x[c] as number
          if (!(n >= 0 && n <= 2)) ko.push(`${cle} ${c} = ${n}`)
        }
        // Le trigger pdj_clamp_breakfasts_included (coupé par le mode replica)
        // aurait recalculé cette valeur : elle doit déjà être juste.
        if (
          x.manual_kind === null &&
          x.breakfasts_included !==
            pdjInclus(
              x.addons as string | null,
              x.rate_plan as string | null,
              x.adults as number,
              x.children as number,
            )
        ) {
          ko.push(`${cle} inclus incohérent`)
        }
        if (x.guests !== (x.adults as number) + (x.children as number))
          ko.push(`${cle} convives`)
        if (vus.has(cle)) ko.push(`${cle} en double`)
        vus.add(cle)
        if (!chambres.has(x.room as number)) ko.push(`${cle} chambre inconnue`)
      }
      expect(ko.slice(0, 5)).toEqual([])
    },
  )

  test.prop([arbGraine, arbDate], RUNS)(
    'noms purgés au-delà de la veille (RGPD)',
    (g, j) => {
      const d = donnees(j, g)
      for (const x of lignes(trouverTable(d, 'public.pdj_breakfasts'))) {
        if (versJour(x.service_date as string) < d.fenetre.aujourdhui - 1) {
          expect(x.guest_name).toBeNull()
          expect(x.purged_at).not.toBeNull()
        } else if (x.guest_name !== null) {
          expect(x.guest_name as string).toMatch(/^Client Test \d{4}$/)
        }
      }
    },
  )
})

describe('intégrité', () => {
  test.prop([arbGraine, arbDate], RUNS)(
    'toutes les clés étrangères sont satisfaites',
    (g, j) => {
      const d = donnees(j, g)
      const ko: string[] = []
      for (const [source, col, cible] of FK) {
        const permis = valeursCible(d, cible)
        for (const v of colonne(trouverTable(d, source), col)) {
          if (v !== null && !permis.has(v))
            ko.push(`${source}.${col} = ${String(v)} absent de ${cible}`)
        }
      }
      expect(ko.slice(0, 5)).toEqual([])
    },
  )

  it('les feuilles de suivi visent une périodicité du référentiel', () => {
    const labels = [
      ...extraireInstruction(
        REFERENTIELS,
        'insert into public.classeur_periodicites',
      )!.sql.matchAll(/\('([^']+)'/g),
    ].map((m) => m[1])
    expect(labels).toHaveLength(9)
    for (const v of colonne(
      trouverTable(donnees(JOUR, 20261013), 'public.classeur_tracking_sheets'),
      'periodicite_id',
    )) {
      const m = (v as { brut: string }).brut.match(/label = '([^']+)'/)
      expect(m && labels.includes(m[1]), String(m?.[1])).toBe(true)
    }
  })

  test.prop([arbGraine, arbDate], RUNS)(
    "contraintes d'unicité respectées",
    (g, j) => {
      const d = donnees(j, g)
      const UNIQUES: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
        ['public.daily_reports', ['date']],
        ['public.forecast_days', ['date']],
        ['public.budget', ['year', 'month']],
        ['public.caisse_sheets', ['report_date', 'shift']],
        ['public.rapro_sheets', ['report_date']],
        ['public.rapro_rooms', ['report_date', 'room']],
        ['public.literie_sheets', ['report_date']],
        ['public.pdj_addon_production', ['service_date', 'code']],
        ['public.pdj_externals', ['service_date']],
        ['public.user_page_permissions', ['user_id', 'page']],
        ['public.classeur_acces', ['classeur_id', 'user_id']],
        ['public.classeur_documents', ['uuid']],
        ['public.classeur_chapters', ['uuid']],
        ['public.facturation_learned_docs', ['hash']],
        ['public.facturation_issuers', ['name']],
        ['public.easter_eggs', ['keyword']],
      ]
      for (const [nom, cols] of UNIQUES) {
        const t = trouverTable(d, nom)
        const cles = t.lignes.map((l) =>
          cols.map((c) => String(l[t.colonnes.indexOf(c)])).join('#'),
        )
        expect(new Set(cles).size, nom).toBe(cles.length)
      }
    },
  )

  test.prop([arbGraine, arbDate], RUNS)(
    'RepJour : occupation bornée par les 80 chambres',
    (g, j) => {
      for (const x of lignes(
        trouverTable(donnees(j, g), 'public.daily_reports'),
      )) {
        expect(x.rj_nuitees as number).toBeGreaterThanOrEqual(0)
        expect(x.rj_nuitees as number).toBeLessThanOrEqual(80)
        expect(x.rj_to as number).toBeLessThanOrEqual(100)
        expect(x.rmtd_nuitees as number).toBeLessThanOrEqual(
          80 * (x.day_of_month as number),
        )
      }
    },
  )

  test.prop([arbGraine, arbDate], RUNS)(
    'caisse : fond de 150 €, cautions cohérentes',
    (g, j) => {
      const d = donnees(j, g)
      expect(FOND_CENTIMES).toBe(15000)
      for (const x of lignes(trouverTable(d, 'public.caisse_cautions'))) {
        if (x.status === 'refunded') {
          expect(x.refunded_date).not.toBeNull()
          expect(x.refunded_by).not.toBeNull()
          expect(versJour(x.refunded_date as string)).toBeGreaterThanOrEqual(
            versJour(x.taken_date as string),
          )
          expect(versJour(x.refunded_date as string)).toBeLessThanOrEqual(
            d.fenetre.aujourdhui,
          )
        } else {
          expect(x.refunded_date).toBeNull()
          expect(x.refunded_by).toBeNull()
        }
      }
    },
  )

  test.prop([arbGraine, arbDate], RUNS)(
    'lits bébé : jamais deux affectations la même nuit sur un lit',
    (g, j) => {
      const parLit = new Map<string, Array<[number, number]>>()
      for (const x of lignes(
        trouverTable(donnees(j, g), 'public.baby_cot_assignments'),
      )) {
        const a = versJour(x.start_date as string)
        const b = versJour(x.end_date as string)
        expect(b).toBeGreaterThan(a)
        const l = parLit.get(x.cot_id as string) ?? []
        l.push([a, b])
        parLit.set(x.cot_id as string, l)
      }
      for (const l of parLit.values()) {
        l.sort((p, q) => p[0] - q[0])
        for (let i = 1; i < l.length; i++)
          expect(l[i][0]).toBeGreaterThanOrEqual(l[i - 1][1])
      }
    },
  )
})

describe('données fictives', () => {
  it('toutes les adresses e-mail du seed sont en @exemple.test', () => {
    const sql = genererSeed({ aujourdhui: JOUR }, REFERENTIELS)
    const adresses = [
      ...sql.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g),
    ].map((m) => m[0])
    expect(adresses.length).toBeGreaterThan(5)
    for (const a of adresses) expect(a).toMatch(/@exemple\.test$/)
  })

  it('les 6 comptes attendus, un par cas', () => {
    expect(COMPTES.map((c) => c.email)).toEqual([
      'admin@exemple.test',
      'gestion@exemple.test',
      'ecriture@exemple.test',
      'lecture@exemple.test',
      'aucun@exemple.test',
      'reception@exemple.test',
    ])
    const d = donnees(JOUR, 20261013)
    const droits = lignes(trouverTable(d, 'public.user_page_permissions'))
    const de = (cle: string) =>
      droits.filter((x) => x.user_id === COMPTES.find((c) => c.cle === cle)!.id)
    expect(de('gestion').map((x) => x.level)).toEqual(Array(9).fill('gestion'))
    expect(de('ecriture').map((x) => x.level)).toEqual(
      Array(9).fill('ecriture'),
    )
    expect(de('lecture').map((x) => x.level)).toEqual(Array(9).fill('lecture'))
    expect(de('aucun')).toEqual([])
    expect(
      lignes(trouverTable(d, 'public.profiles')).filter(
        (x) => x.role === 'admin',
      ),
    ).toHaveLength(1)
  })

  it('les noms de clients sont tous de la forme « Client Test n »', () => {
    const d = donnees(JOUR, 20261013)
    for (const v of colonne(
      trouverTable(d, 'public.parking_reservations'),
      'client',
    )) {
      expect(v as string).toMatch(/^(Client|Employé) Test \d+$/)
    }
  })

  it('le seul destinataire du rapport est rapport@exemple.test', () => {
    expect(
      colonne(
        trouverTable(
          donnees(JOUR, 20261013),
          'public.server_report_recipients',
        ),
        'email',
      ),
    ).toEqual(['rapport@exemple.test'])
  })

  it('classeurs : essai, procédures (30 documents), registre privé', () => {
    const d = donnees(JOUR, 20261013)
    const noms = colonne(trouverTable(d, 'public.classeur_classeurs'), 'name')
    expect(noms).toHaveLength(3)
    const chapitres = lignes(trouverTable(d, 'public.classeur_chapters'))
    const docs = lignes(trouverTable(d, 'public.classeur_documents'))
    const deClasseur = (id: number) =>
      docs.filter(
        (x) => chapitres.find((c) => c.id === x.chapter_id)!.classeur_id === id,
      )
    expect(deClasseur(2)).toHaveLength(30)
    expect(deClasseur(1).length).toBeGreaterThanOrEqual(10)
    const essai = deClasseur(1)
      .map((x) => x.content as string)
      .join('\n')
    for (const motif of [
      '> [!WARNING]',
      '| --- |',
      '](a-inserer',
      ':::photos',
      ':::etape',
      '```mermaid',
      '\n===\n',
    ]) {
      expect(essai, motif).toContain(motif)
    }
  })
})

describe('extraction des référentiels', () => {
  it('ignore un ; dans une chaîne ou un commentaire', () => {
    const r = extraireInstruction(
      "x; insert into t values ('a;b') -- fin; pas ici\n, ('c');\nsuite;",
      'insert into t',
    )
    expect(r?.sql).toBe(
      "insert into t values ('a;b') -- fin; pas ici\n, ('c');",
    )
  })

  it('reprend les dix familles de référentiels attendues', () => {
    for (const debut of [
      'insert into public.classeur_periodicites',
      'insert into public.hotel_rooms',
      'insert into public.literie_stock',
      'insert into public.affiche_templates',
      'insert into public.facturation_budget_lines',
      'update public.facturation_budget_lines set hint',
      'insert into public.facturation_ref_comptes',
      'insert into public.facturation_ref_imputations',
    ]) {
      expect(REFERENTIELS.toLowerCase(), debut).toContain(debut)
    }
    expect(REFERENTIELS).not.toMatch(/Galland/)
  })
})

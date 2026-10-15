import { beforeEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'

import {
  Requete,
  SimulateurSupabase,
} from '#/lib/classeur/test/simulateurSupabase.ts'
import type { Ligne } from '#/lib/classeur/test/simulateurSupabase.ts'

/*
 * Services du rapport journalier RepJour (`services/daily.ts`), contre le
 * SIMULATEUR PostgREST du Classeur (aucun réseau, la base n'est jamais
 * touchée). Le simulateur reproduit la RLS comme la vraie base : un
 * `select`/`update`/`delete` refusé rend 0 ligne SANS erreur, un `insert` /
 * `upsert` refusé rend 42501.
 *
 * Ce qu'il ne simule pas, ajouté ici par une sous-classe de `Requete` (sans
 * toucher au simulateur partagé) :
 *   - `.not(col, 'is', null)` (fraîcheur du Forecast) ;
 *   - `upsert(..., { onConflict })` : la ligne existante est retrouvée par
 *     les colonnes de conflit, comme `ON CONFLICT (year, month)` ;
 *   - `rpc()` et `auth.getUser()`.
 * Chaque requête est journalisée (table, colonnes, filtres) pour vérifier les
 * colonnes demandées et les bornes.
 *
 * ORACLES : la documentation en tête de chaque fonction de `daily.ts`, le
 * comportement documenté de PostgREST / supabase-js (`maybeSingle`, RLS), le
 * calendrier grégorien, et la règle de l'audit du 2026-09-28 (CLAUDE.md :
 * « un update/delete refusé par la RLS rend 0 ligne SANS erreur »). Aucune
 * valeur attendue n'est recopiée d'une sortie observée.
 */

interface Trace {
  table: string
  colonnes?: string
  filtres: Array<[string, string, unknown]>
  upsertOptions?: unknown
}

const etat = vi.hoisted(() => ({
  sim: null as unknown as SimulateurSupabase,
  traces: [] as Trace[],
  rpcs: [] as Array<{ nom: string; params: unknown }>,
  rpcReponse: { data: null as unknown, error: null as unknown },
  utilisateur: { id: 'u1' } as { id: string } | null,
  client: null as unknown,
}))

class RequeteEspion extends Requete {
  trace: Trace
  constructor(sim: SimulateurSupabase, table: string) {
    super(sim, table)
    this.trace = { table, filtres: [] }
    etat.traces.push(this.trace)
  }
  override select(colonnes = '*'): this {
    this.trace.colonnes = colonnes
    return super.select(colonnes)
  }
  override filter(col: string, op: string, val: unknown): this {
    this.trace.filtres.push([col, op, val])
    return super.filter(col, op, val)
  }
  not(col: string, op: string, val: unknown): this {
    this.trace.filtres.push([col, `not.${op}`, val])
    if (op !== 'is') throw new Error(`not.${op} non simulé`)
    this.filtres.push((l) => (l[col] ?? null) !== val)
    return this
  }
  override upsert(v: Ligne | Ligne[], options?: { onConflict?: string }): this {
    this.trace.upsertOptions = options
    const valeurs = (Array.isArray(v) ? v : [v]).map((x) => ({ ...x }))
    const cles = options?.onConflict?.split(',').map((c) => c.trim()) ?? []
    if (cles.length > 0) {
      for (const val of valeurs) {
        const existante = etat.sim
          .table(this.table)
          .find((l) => cles.every((c) => l[c] === val[c]))
        if (existante) val.id = existante.id
      }
    }
    return super.upsert(valeurs)
  }
}

function nouveauClient(sim: SimulateurSupabase) {
  return {
    from: (table: string) => new RequeteEspion(sim, table),
    rpc: (nom: string, params: unknown) => {
      etat.rpcs.push({ nom, params })
      return Promise.resolve(etat.rpcReponse)
    },
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: etat.utilisateur }, error: null }),
    },
  }
}

vi.mock('#/lib/supabase.ts', () => ({
  get supabase() {
    return etat.client
  },
}))

const daily = await import('#/lib/repjour/services/daily.ts')

const PANNE = { message: 'Panne simulée', code: '08006' }

/** Rapport minimal : seules les colonnes lues par le service comptent. */
function rapport(date: string, extra: Ligne = {}): Ligne {
  const [y, m, d] = date.split('-').map(Number)
  return {
    id: Number(date.replaceAll('-', '')),
    date,
    year: y,
    month: m,
    day_of_month: d,
    days_in_month: joursDuMois(y, m),
    rj_nuitees: 40,
    ...extra,
  }
}

/** ORACLE calendrier grégorien, écrit indépendamment de `new Date`. */
function joursDuMois(annee: number, mois: number): number {
  if (mois === 2) {
    const bissextile =
      (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0
    return bissextile ? 29 : 28
  }
  return [4, 6, 9, 11].includes(mois) ? 30 : 31
}

function initialiser(tables: Record<string, Ligne[]> = {}) {
  etat.sim = new SimulateurSupabase(tables)
  etat.client = nouveauClient(etat.sim)
  etat.traces.length = 0
}

beforeEach(() => {
  initialiser()
  etat.rpcs.length = 0
  etat.rpcReponse = { data: null, error: null }
  etat.utilisateur = { id: 'u1' }
})

// ── Propagation de `{ error }` ─────────────────────────────────────────────

describe('chaque lecture propage { error } (supabase-js ne lève jamais)', () => {
  /*
   * ORACLE : en-tête de daily.ts (« on remonte les erreurs réelles ») et
   * CLAUDE.md (« une erreur réseau n'efface jamais le cache » : une lecture
   * en panne doit ÉCHOUER, pas rendre null/[] que TanStack Query mettrait en
   * cache comme « aucune donnée »).
   */
  const lectures: Array<[string, () => Promise<unknown>]> = [
    ['fetchLatestReport', () => daily.fetchLatestReport()],
    ['fetchReportByDate', () => daily.fetchReportByDate('2026-03-10')],
    ['fetchAvailableDates', () => daily.fetchAvailableDates()],
    ['fetchMonthReports', () => daily.fetchMonthReports(2026, 3)],
    ['fetchBudget', () => daily.fetchBudget(2026, 3)],
    ['fetchForecastMonthTotal', () => daily.fetchForecastMonthTotal(2026, 3)],
    ['fetchForecastFreshness', () => daily.fetchForecastFreshness(2026, 3)],
    [
      'fetchPreviousReportInMonth',
      () => daily.fetchPreviousReportInMonth('2026-03-10', 2026, 3),
    ],
    ['fetchLatestReportOfMonth', () => daily.fetchLatestReportOfMonth(2026, 3)],
    ['fetchBudgetYears', () => daily.fetchBudgetYears()],
    ['fetchYearBudget', () => daily.fetchYearBudget(2026)],
    ['upsertBudget', () => daily.upsertBudget([])],
  ]
  for (const [nom, appel] of lectures) {
    it(`${nom} : panne de la base → rejet avec l'erreur d'origine`, async () => {
      etat.sim.panneAuAppel(1)
      await expect(appel()).rejects.toMatchObject(PANNE)
    })
  }

  it('fetchYearAnalytics : panne sur la 1re OU la 2e lecture → rejet', async () => {
    // ORACLE : les deux réponses du Promise.all sont contrôlées.
    etat.sim.panneAuAppel(1)
    await expect(daily.fetchYearAnalytics(2026)).rejects.toMatchObject(PANNE)
    initialiser()
    etat.sim.panneAuAppel(2)
    await expect(daily.fetchYearAnalytics(2026)).rejects.toMatchObject(PANNE)
  })

  it('deleteYearBudget : panne → rejet', async () => {
    // Appel 1 = le delete (getUser n'est pas une requête de table).
    etat.sim.panneAuAppel(1)
    await expect(daily.deleteYearBudget(2026)).rejects.toMatchObject(PANNE)
  })

  const rpcs: Array<[string, () => Promise<unknown>]> = [
    ['dismissSendReminder', () => daily.dismissSendReminder('2026-03-10')],
    ['fetchRepjourDashboard', () => daily.fetchRepjourDashboard('2026-03-10')],
    [
      'fetchRepjourAnalytiqueAnnuelle',
      () => daily.fetchRepjourAnalytiqueAnnuelle(2026),
    ],
    [
      'fetchRepjourAnalytiqueMensuelle',
      () => daily.fetchRepjourAnalytiqueMensuelle(2026, 3),
    ],
  ]
  for (const [nom, appel] of rpcs) {
    it(`${nom} : erreur de la RPC → rejet`, async () => {
      etat.rpcReponse = { data: { rapport: null }, error: PANNE }
      await expect(appel()).rejects.toMatchObject(PANNE)
    })
  }
})

// ── RPC : nom, paramètres, replis ──────────────────────────────────────────

describe('RPC : nom et paramètres', () => {
  it('chaque RPC reçoit exactement ses paramètres', async () => {
    // ORACLE : signatures SQL citées dans les commentaires de daily.ts.
    await daily.dismissSendReminder('2026-03-10')
    await daily.fetchRepjourDashboard('2026-03-11')
    await daily.fetchRepjourAnalytiqueAnnuelle(2025)
    await daily.fetchRepjourAnalytiqueMensuelle(2025, 12)
    expect(etat.rpcs).toEqual([
      { nom: 'dismiss_send_reminder', params: { p_date: '2026-03-10' } },
      { nom: 'repjour_dashboard', params: { p_date: '2026-03-11' } },
      { nom: 'repjour_analytique_annuelle', params: { p_annee: 2025 } },
      {
        nom: 'repjour_analytique_mensuelle',
        params: { p_annee: 2025, p_mois: 12 },
      },
    ])
  })

  it('fetchRepjourDashboard : réponse vide → nulls et tableaux vides', async () => {
    // ORACLE : commentaire « mieux vaut un tableau vide qu'un plantage ».
    etat.rpcReponse = { data: null, error: null }
    expect(await daily.fetchRepjourDashboard('2026-03-10')).toEqual({
      rapport: null,
      budget: null,
      forecastTotal: null,
      forecastFraicheur: null,
      dernierDuMois: null,
      rapportPrecedent: null,
      rapportsDuMois: [],
      datesDisponibles: [],
    })
  })

  it('fetchRepjourDashboard : champs présents repris tels quels', async () => {
    // ORACLE : la RPC livre la forme de RepjourDashboard ; rien n'est recalculé.
    const r = rapport('2026-03-10')
    etat.rpcReponse = {
      data: {
        rapport: r,
        forecastTotal: { occ: 10, revTTC: 2000 },
        forecastFraicheur: '2026-03-10T03:00:00Z',
        rapportsDuMois: [r],
        datesDisponibles: ['2026-03-10'],
      },
      error: null,
    }
    const d = await daily.fetchRepjourDashboard('2026-03-10')
    expect(d.rapport).toEqual(r)
    expect(d.forecastTotal).toEqual({ occ: 10, revTTC: 2000 })
    expect(d.forecastFraicheur).toBe('2026-03-10T03:00:00Z')
    expect(d.rapportsDuMois).toEqual([r])
    expect(d.datesDisponibles).toEqual(['2026-03-10'])
    expect(d.budget).toBeNull()
  })

  it('analytique mensuelle : réponse vide → jours [], budget et première date null', async () => {
    // ORACLE : « `null` quand la table est vide » (premiereDate).
    expect(await daily.fetchRepjourAnalytiqueMensuelle(2026, 3)).toEqual({
      jours: [],
      budget: null,
      premiereDate: null,
    })
  })

  it('analytique annuelle : réponse vide → trois tableaux vides', async () => {
    expect(await daily.fetchRepjourAnalytiqueAnnuelle(2026)).toEqual({
      annees: [],
      budgets: [],
      mois: [],
    })
  })
})

// ── Bornes et filtres de date ──────────────────────────────────────────────

describe('bornes et filtres de date', () => {
  const RAPPORTS = [
    rapport('2026-02-28'),
    rapport('2026-03-01'),
    rapport('2026-03-09'),
    rapport('2026-03-10'),
    rapport('2026-03-31'),
    rapport('2026-04-01'),
    rapport('2025-03-15'),
  ]

  it('fetchReportByDate : le jour exact, null si absent', async () => {
    // ORACLE : `.eq('date', date)` + maybeSingle (absence = null, pas d'erreur).
    initialiser({ daily_reports: RAPPORTS })
    expect((await daily.fetchReportByDate('2026-03-10'))?.date).toBe(
      '2026-03-10',
    )
    expect(await daily.fetchReportByDate('2026-03-11')).toBeNull()
  })

  it('fetchMonthReports : tout le mois, ni la veille du 1er ni le lendemain du 31, ni une autre année', async () => {
    // ORACLE : mars 2026 = du 1er au 31 ; tri par jour croissant (doc du tri).
    initialiser({ daily_reports: [...RAPPORTS].reverse() })
    const dates = (await daily.fetchMonthReports(2026, 3)).map((r) => r.date)
    expect(dates).toEqual([
      '2026-03-01',
      '2026-03-09',
      '2026-03-10',
      '2026-03-31',
    ])
  })

  it('fetchPreviousReportInMonth : strictement AVANT la date, même mois', async () => {
    // ORACLE : doc — « ANTÉRIEUR à `date`, dans le MÊME mois ».
    initialiser({ daily_reports: RAPPORTS })
    expect(
      (await daily.fetchPreviousReportInMonth('2026-03-10', 2026, 3))?.date,
    ).toBe('2026-03-09')
  })

  it('fetchPreviousReportInMonth : au 1er du mois → null (pas le 28 février)', async () => {
    // ORACLE : doc — « Au 1er du mois, renvoie donc `null` ».
    initialiser({ daily_reports: RAPPORTS })
    expect(
      await daily.fetchPreviousReportInMonth('2026-03-01', 2026, 3),
    ).toBeNull()
  })

  it('fetchPreviousReportInMonth : trou dans la série → dernier rapport présent', async () => {
    // ORACLE : doc — « on remonte au dernier rapport réellement présent ».
    initialiser({ daily_reports: RAPPORTS })
    expect(
      (await daily.fetchPreviousReportInMonth('2026-03-31', 2026, 3))?.date,
    ).toBe('2026-03-10')
  })

  it('fetchPreviousReportInMonth : propriété — le plus grand jour < date du même mois', async () => {
    // ORACLE : définition de la doc, calculée par filtre/max indépendant.
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.integer({ min: 1, max: 31 }), { maxLength: 15 }),
        fc.uniqueArray(fc.integer({ min: 1, max: 28 }), { maxLength: 5 }),
        fc.integer({ min: 1, max: 31 }),
        async (joursMars, joursFevrier, jour) => {
          const d = (m: number, j: number) =>
            `2026-0${m}-${String(j).padStart(2, '0')}`
          initialiser({
            daily_reports: [
              ...joursMars.map((j) => rapport(d(3, j))),
              ...joursFevrier.map((j) => rapport(d(2, j))),
            ],
          })
          const avant = joursMars.filter((j) => j < jour)
          const attendu = avant.length ? d(3, Math.max(...avant)) : null
          const r = await daily.fetchPreviousReportInMonth(d(3, jour), 2026, 3)
          expect(r?.date ?? null).toBe(attendu)
        },
      ),
    )
  })

  it('fetchLatestReportOfMonth : plus grand jour du mois demandé', async () => {
    // ORACLE : doc — « Dernier rapport importé d'un mois ».
    initialiser({ daily_reports: RAPPORTS })
    expect((await daily.fetchLatestReportOfMonth(2026, 3))?.date).toBe(
      '2026-03-31',
    )
    expect(await daily.fetchLatestReportOfMonth(2026, 5)).toBeNull()
  })

  it('fetchLatestReport : la date la plus récente, toutes années', async () => {
    initialiser({ daily_reports: RAPPORTS })
    expect((await daily.fetchLatestReport())?.date).toBe('2026-04-01')
  })

  it('fetchLatestReport : table vide → null sans erreur', async () => {
    expect(await daily.fetchLatestReport()).toBeNull()
  })

  it('fetchAvailableDates : décroissantes, plafond explicite de 5 000', async () => {
    // ORACLE : doc — « de la plus récente à la plus ancienne » + garde-fou
    // AVAILABLE_DATES_MAX = 5 000 (sinon PostgREST tronque à 1 000).
    initialiser({ daily_reports: RAPPORTS })
    const dates = await daily.fetchAvailableDates()
    expect(dates).toEqual(
      RAPPORTS.map((r) => r.date as string)
        .sort()
        .reverse(),
    )
    expect(etat.traces[0]).toMatchObject({ colonnes: 'date' })
  })

  it('fetchAvailableDates : plus de 5 000 lignes → 5 000 dates, les plus récentes', async () => {
    const lignes: Ligne[] = []
    for (let i = 0; i < 5_002; i++) {
      lignes.push({ id: i, date: `D${String(i).padStart(5, '0')}` })
    }
    initialiser({ daily_reports: lignes })
    const dates = await daily.fetchAvailableDates()
    expect(dates).toHaveLength(5_000)
    expect(dates[0]).toBe('D05001')
    expect(dates.at(-1)).toBe('D00002')
  })

  it('fetchBudget : le mois demandé seulement, null si aucun (maybeSingle)', async () => {
    // ORACLE : commentaire — « un mois sans budget renvoie simplement null ».
    initialiser({
      budget: [
        { id: 1, year: 2026, month: 3, nuitees: 1 },
        { id: 2, year: 2026, month: 4, nuitees: 2 },
        { id: 3, year: 2025, month: 3, nuitees: 3 },
      ],
    })
    expect((await daily.fetchBudget(2026, 3))?.id).toBe(1)
    expect(await daily.fetchBudget(2026, 5)).toBeNull()
  })

  it('fetchYearBudget : l’année demandée, triée par mois', async () => {
    initialiser({
      budget: [
        { id: 1, year: 2026, month: 12 },
        { id: 2, year: 2025, month: 1 },
        { id: 3, year: 2026, month: 1 },
      ],
    })
    expect((await daily.fetchYearBudget(2026)).map((b) => b.id)).toEqual([3, 1])
  })

  it('fetchBudgetYears : années distinctes, croissantes', async () => {
    // ORACLE : doc — « Années disponibles » (un sélecteur, donc sans doublon).
    initialiser({
      budget: [
        { id: 1, year: 2026, month: 1 },
        { id: 2, year: 2024, month: 1 },
        { id: 3, year: 2026, month: 2 },
      ],
    })
    expect(await daily.fetchBudgetYears()).toEqual([2024, 2026])
    expect(etat.traces[0]).toMatchObject({ colonnes: 'year' })
  })
})

// ── Prévisions ─────────────────────────────────────────────────────────────

describe('prévisions (forecast_days)', () => {
  it('fetchForecastMonthTotal : aucune prévision → null (pas un total à 0)', async () => {
    // ORACLE : doc — « ou `null` si aucune ».
    initialiser({ forecast_days: [{ id: 1, year: 2026, month: 4, occ: 9 }] })
    expect(await daily.fetchForecastMonthTotal(2026, 3)).toBeNull()
  })

  it('fetchForecastMonthTotal : propriété — sommes du seul mois demandé', async () => {
    // ORACLE : somme arithmétique (entiers : aucun arrondi flottant).
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            month: fc.integer({ min: 2, max: 4 }),
            occ: fc.integer({ min: 0, max: 120 }),
            rev_ttc: fc.integer({ min: 0, max: 20_000 }),
          }),
          { minLength: 1, maxLength: 40 },
        ),
        async (lignes) => {
          initialiser({
            forecast_days: lignes.map((l, i) => ({ id: i, year: 2026, ...l })),
          })
          const mars = lignes.filter((l) => l.month === 3)
          const attendu =
            mars.length === 0
              ? null
              : {
                  occ: mars.reduce((s, l) => s + l.occ, 0),
                  revTTC: mars.reduce((s, l) => s + l.rev_ttc, 0),
                }
          expect(await daily.fetchForecastMonthTotal(2026, 3)).toEqual(attendu)
        },
      ),
    )
    expect(etat.traces.at(-1)).toMatchObject({ colonnes: 'occ, rev_ttc' })
  })

  it('fetchForecastFreshness : dernier imported_at non nul du mois', async () => {
    // ORACLE : doc — « Dernier `imported_at` … ou `null` si aucun ». En
    // Postgres, `order by … desc` range les NULL EN TÊTE : sans le filtre
    // `not is null`, le dernier import serait masqué par une ligne jamais
    // importée. Le filtre est donc exigé.
    initialiser({
      forecast_days: [
        { id: 1, year: 2026, month: 3, imported_at: '2026-03-09T03:00:00Z' },
        { id: 2, year: 2026, month: 3, imported_at: '2026-03-10T03:00:00Z' },
        { id: 3, year: 2026, month: 4, imported_at: '2026-04-01T03:00:00Z' },
      ],
    })
    expect(await daily.fetchForecastFreshness(2026, 3)).toBe(
      '2026-03-10T03:00:00Z',
    )
    expect(etat.traces[0].colonnes).toBe('imported_at')
    expect(etat.traces[0].filtres).toContainEqual([
      'imported_at',
      'not.is',
      null,
    ])
  })

  it('fetchForecastFreshness : seulement des lignes jamais importées → null', async () => {
    initialiser({
      forecast_days: [{ id: 1, year: 2026, month: 3, imported_at: null }],
    })
    expect(await daily.fetchForecastFreshness(2026, 3)).toBeNull()
  })
})

// ── Colonnes demandées ─────────────────────────────────────────────────────

describe('colonnes demandées', () => {
  it('fetchYearAnalytics : colonnes explicites, jamais *', async () => {
    // ORACLE : interfaces AnalyticsReportRow / AnalyticsForecastRow de daily.ts
    // et la règle « select de colonnes explicites » (CLAUDE.md).
    await daily.fetchYearAnalytics(2026)
    const cols = (t: string) =>
      etat.traces
        .find((x) => x.table === t)
        ?.colonnes?.split(',')
        .map((c) => c.trim())
        .sort()
    expect(cols('daily_reports')).toEqual(
      [
        'month',
        'day_of_month',
        'days_in_month',
        'rj_nuitees',
        'pm_nuitees',
        'pm_to',
        'pm_pm',
        'pm_revpar',
        'pm_room_revenue',
        'rmtd_nuitees',
        'rmtd_room_revenue',
      ].sort(),
    )
    expect(cols('forecast_days')).toEqual(['month', 'occ', 'rev_ttc'].sort())
    expect(etat.traces.every((t) => t.filtres.length > 0)).toBe(true)
  })
})

// ── Analytique annuelle (chemin de repli TypeScript) ───────────────────────

describe('fetchYearAnalytics', () => {
  it('table vide → 12 mois « vide », tout à 0', async () => {
    // ORACLE : priorité 4 de la doc (« sinon → vide »).
    const r = await daily.fetchYearAnalytics(2026)
    expect(r.map((m) => m.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ])
    for (const m of r) {
      expect(m).toMatchObject({
        source: 'vide',
        nuitees: 0,
        to: 0,
        pm: 0,
        revpar: 0,
        revenue: 0,
        daysWithData: 0,
        hasOvercapacity: false,
      })
    }
  })

  it('mois complet → réalisé RMTD ; formules TO / PM / RevPAR', async () => {
    // ORACLE : TO = nuitées / (80 × jours) × 100, PM = CA / nuitées,
    // RevPAR = CA / (80 × jours). Avril 2026 = 30 jours → capacité 2 400.
    initialiser({
      daily_reports: [
        rapport('2026-04-29', { rmtd_nuitees: 1, rmtd_room_revenue: 1 }),
        rapport('2026-04-30', {
          rmtd_nuitees: 1_200,
          rmtd_room_revenue: 120_000,
        }),
      ],
    })
    const avril = (await daily.fetchYearAnalytics(2026))[3]
    expect(avril).toMatchObject({
      month: 4,
      source: 'realise',
      nuitees: 1_200,
      revenue: 120_000,
      daysWithData: 2,
      hasOvercapacity: false,
    })
    expect(avril.to).toBeCloseTo(50, 10)
    expect(avril.pm).toBeCloseTo(100, 10)
    expect(avril.revpar).toBeCloseTo(50, 10)
  })

  it('mois incomplet → projeté : champs pm_* du DERNIER rapport, tels quels', async () => {
    // ORACLE : priorité 2 de la doc (« projeté fin de mois du dernier rapport »).
    initialiser({
      daily_reports: [
        rapport('2026-05-10', { pm_nuitees: 999, pm_to: 99 }),
        rapport('2026-05-12', {
          pm_nuitees: 1_500,
          pm_to: 60.5,
          pm_pm: 110,
          pm_revpar: 66.5,
          pm_room_revenue: 165_000,
        }),
      ],
    })
    expect((await daily.fetchYearAnalytics(2026))[4]).toEqual({
      month: 5,
      source: 'projete',
      nuitees: 1_500,
      to: 60.5,
      pm: 110,
      revpar: 66.5,
      revenue: 165_000,
      daysWithData: 2,
      hasOvercapacity: false,
    })
  })

  it('surcapacité : > 80 strictement (80 n’en est pas une)', async () => {
    // ORACLE : TOTAL_ROOMS = 80 chambres (CLAUDE.md, constants.ts) ; 80
    // nuitées = hôtel plein, pas en surcapacité ; 81 l'est.
    initialiser({
      daily_reports: [
        rapport('2026-01-05', { rj_nuitees: 80 }),
        rapport('2026-02-05', { rj_nuitees: 81 }),
      ],
      forecast_days: [
        { id: 1, year: 2026, month: 3, occ: 80, rev_ttc: 0 },
        { id: 2, year: 2026, month: 4, occ: 81, rev_ttc: 0 },
      ],
    })
    const r = await daily.fetchYearAnalytics(2026)
    expect(r.slice(0, 4).map((m) => m.hasOvercapacity)).toEqual([
      false,
      true,
      false,
      true,
    ])
  })

  it('ne lit que l’année demandée', async () => {
    initialiser({
      daily_reports: [rapport('2025-06-05')],
      forecast_days: [{ id: 1, year: 2025, month: 7, occ: 5, rev_ttc: 5 }],
    })
    const r = await daily.fetchYearAnalytics(2026)
    expect(r.every((m) => m.source === 'vide')).toBe(true)
  })

  it('propriété — priorité des sources et agrégats conformes à la doc', async () => {
    // ORACLE : les 4 priorités documentées en tête de fetchYearAnalytics, le
    // calendrier grégorien (joursDuMois), TOTAL_ROOMS = 80. Entiers seulement.
    const annee = fc.constantFrom(2024, 2025, 2026, 2100)
    const moisRapports = fc.dictionary(
      fc.integer({ min: 1, max: 12 }).map(String),
      fc.uniqueArray(fc.integer({ min: 1, max: 28 }), {
        minLength: 1,
        maxLength: 4,
      }),
      { maxKeys: 5 },
    )
    const prevs = fc.array(
      fc.record({
        month: fc.integer({ min: 1, max: 12 }),
        occ: fc.integer({ min: 0, max: 90 }),
        rev_ttc: fc.integer({ min: 0, max: 10_000 }),
      }),
      { maxLength: 30 },
    )
    await fc.assert(
      fc.asyncProperty(
        annee,
        moisRapports,
        prevs,
        fc.boolean(),
        fc.integer({ min: 0, max: 100 }),
        async (y, parMois, previsions, complet, nuit) => {
          const lignes: Ligne[] = []
          let id = 0
          for (const [mStr, jours] of Object.entries(parMois)) {
            const m = Number(mStr)
            const dim = joursDuMois(y, m)
            const js = complet ? [...jours.slice(1), dim] : jours
            for (const j of js) {
              lignes.push({
                id: ++id,
                year: y,
                month: m,
                day_of_month: j,
                days_in_month: dim,
                rj_nuitees: nuit,
                pm_nuitees: j * 10,
                pm_to: j,
                pm_pm: j + 1,
                pm_revpar: j + 2,
                pm_room_revenue: j * 100,
                rmtd_nuitees: j * 20,
                rmtd_room_revenue: j * 2_000,
              })
            }
          }
          initialiser({
            daily_reports: lignes,
            forecast_days: previsions.map((p, i) => ({ id: i, year: y, ...p })),
          })
          const r = await daily.fetchYearAnalytics(y)
          expect(r).toHaveLength(12)
          for (let m = 1; m <= 12; m++) {
            const res = r[m - 1]
            expect(res.month).toBe(m)
            const rs = lignes.filter((l) => l.month === m)
            const fs = previsions.filter((p) => p.month === m)
            const dim = joursDuMois(y, m)
            const surcap =
              rs.some((l) => (l.rj_nuitees as number) > 80) ||
              fs.some((p) => p.occ > 80)
            if (rs.length > 0) {
              const dernier = Math.max(
                ...rs.map((l) => l.day_of_month as number),
              )
              expect(res.daysWithData).toBe(rs.length)
              expect(res.hasOvercapacity).toBe(surcap)
              if (dernier === dim) {
                expect(res.source).toBe('realise')
                expect(res.nuitees).toBe(dernier * 20)
                expect(res.revenue).toBe(dernier * 2_000)
                expect(res.to).toBeCloseTo(
                  ((dernier * 20) / (80 * dim)) * 100,
                  9,
                )
              } else {
                expect(res.source).toBe('projete')
                expect(res.nuitees).toBe(dernier * 10)
                expect(res.to).toBe(dernier)
                expect(res.revenue).toBe(dernier * 100)
              }
            } else if (fs.length > 0) {
              const occ = fs.reduce((s, p) => s + p.occ, 0)
              const rev = fs.reduce((s, p) => s + p.rev_ttc, 0)
              expect(res.source).toBe('forecast')
              expect(res.daysWithData).toBe(fs.length)
              expect(res.nuitees).toBe(occ)
              expect(res.revenue).toBe(rev)
              expect(res.to).toBeCloseTo((occ / (80 * dim)) * 100, 9)
              expect(res.revpar).toBeCloseTo(rev / (80 * dim), 9)
              expect(res.pm).toBe(occ > 0 ? rev / occ : 0)
              expect(res.hasOvercapacity).toBe(surcap)
            } else {
              expect(res.source).toBe('vide')
              expect(res.hasOvercapacity).toBe(false)
            }
          }
        },
      ),
      { numRuns: 150 },
    )
  })
})

// ── Analytique annuelle par RPC : formules appliquées côté TypeScript ───────

describe('fetchRepjourAnalytiqueAnnuelle (formules)', () => {
  it('propriété — réalisé/forecast : TO, PM, RevPAR par les formules d’origine', async () => {
    // ORACLE : doc — « `to`, `pm` et `revpar` sont calculés ICI, par les
    // formules d'origine » ; TO = n / (80 × j) × 100 ; PM = 0 si n = 0.
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('realise' as const, 'forecast' as const),
        fc.integer({ min: 0, max: 3_000 }),
        fc.integer({ min: 0, max: 500_000 }),
        fc.integer({ min: 28, max: 31 }),
        async (source, nuitees, revenue, jours) => {
          etat.rpcReponse = {
            data: {
              mois: [
                {
                  month: 3,
                  source,
                  nuitees,
                  revenue,
                  joursDuMois: jours,
                  daysWithData: 4,
                  hasOvercapacity: true,
                },
              ],
            },
            error: null,
          }
          const [m] = (await daily.fetchRepjourAnalytiqueAnnuelle(2026)).mois
          expect(m.source).toBe(source)
          expect(m.nuitees).toBe(nuitees)
          expect(m.revenue).toBe(revenue)
          expect(m.daysWithData).toBe(4)
          expect(m.hasOvercapacity).toBe(true)
          expect(m.to).toBeCloseTo((nuitees / (80 * jours)) * 100, 9)
          expect(m.revpar).toBeCloseTo(revenue / (80 * jours), 9)
          if (nuitees === 0) expect(m.pm).toBe(0)
          else expect(m.pm).toBeCloseTo(revenue / nuitees, 9)
        },
      ),
    )
  })

  it('projeté : pm_* repris tels quels, 0 si absents ; vide : tout à 0', async () => {
    // ORACLE : moisDepuisBrut — « REPRIS TELS QUELS, sans aucun recalcul » ;
    // un mois « vide » ne porte jamais de surcapacité (doc, priorité 4).
    etat.rpcReponse = {
      data: {
        annees: [2026],
        mois: [
          {
            month: 1,
            source: 'projete',
            nuitees: 10,
            revenue: 1_000,
            joursDuMois: 31,
            daysWithData: 2,
            hasOvercapacity: false,
            pmTo: 12.5,
            pmPm: 100,
            pmRevpar: 12.5,
          },
          {
            month: 2,
            source: 'projete',
            nuitees: 10,
            revenue: 1_000,
            joursDuMois: 28,
            daysWithData: 1,
            hasOvercapacity: false,
          },
          {
            month: 3,
            source: 'vide',
            nuitees: 7,
            revenue: 7,
            joursDuMois: 31,
            daysWithData: 3,
            hasOvercapacity: true,
          },
        ],
      },
      error: null,
    }
    const r = await daily.fetchRepjourAnalytiqueAnnuelle(2026)
    expect(r.annees).toEqual([2026])
    expect(r.budgets).toEqual([])
    expect(r.mois[0]).toMatchObject({ to: 12.5, pm: 100, revpar: 12.5 })
    expect(r.mois[1]).toMatchObject({ to: 0, pm: 0, revpar: 0, nuitees: 10 })
    expect(r.mois[2]).toEqual({
      month: 3,
      source: 'vide',
      nuitees: 0,
      to: 0,
      pm: 0,
      revpar: 0,
      revenue: 0,
      daysWithData: 0,
      hasOvercapacity: false,
    })
  })
})

// ── Écritures budget ───────────────────────────────────────────────────────

describe('écritures budget', () => {
  const LIGNE = {
    year: 2026,
    month: 3,
    nuitees: 1_000,
    taux_occupation: 40,
    prix_moyen: 100,
    revpar: 40,
    room_revenue: 100_000,
  }

  it('upsertBudget : idempotent sur (year, month) — pas de doublon', async () => {
    // ORACLE : doc — « idempotent sur la clé (year, month) ».
    initialiser({ budget: [{ id: 7, ...LIGNE, nuitees: 1 }] })
    await daily.upsertBudget([LIGNE])
    await daily.upsertBudget([LIGNE])
    expect(etat.sim.table('budget')).toHaveLength(1)
    expect(etat.sim.table('budget')[0]).toMatchObject({ id: 7, nuitees: 1_000 })
    expect(etat.traces[0].upsertOptions).toEqual({ onConflict: 'year,month' })
  })

  it('upsertBudget : refus RLS (42501) → rejet', async () => {
    // ORACLE : un insert/upsert refusé par la RLS rend 42501 (PostgREST).
    etat.sim.refuser('budget', 'upsert')
    await expect(daily.upsertBudget([LIGNE])).rejects.toMatchObject({
      code: '42501',
    })
  })

  it('deleteYearBudget : supprime l’année demandée, et elle seule', async () => {
    initialiser({
      budget: [
        { id: 1, year: 2026, month: 1 },
        { id: 2, year: 2026, month: 2 },
        { id: 3, year: 2025, month: 1 },
      ],
    })
    await daily.deleteYearBudget(2026)
    expect(etat.sim.table('budget').map((b) => b.id)).toEqual([3])
  })

  it('deleteYearBudget : sans session → refusé AVANT toute requête', async () => {
    // ORACLE : doc — « gardé par `assertWriteRole` (D17) ».
    initialiser({ budget: [{ id: 1, year: 2026, month: 1 }] })
    etat.utilisateur = null
    await expect(daily.deleteYearBudget(2026)).rejects.toThrow(/connecté/)
    expect(etat.sim.journal).toEqual([])
    expect(etat.sim.table('budget')).toHaveLength(1)
  })

  it.fails(
    'DÉFAUT : deleteYearBudget refusé par la RLS (0 ligne, sans erreur) est annoncé comme un succès',
    async () => {
      // ORACLE : règle de l'audit du 2026-09-28 (CLAUDE.md) — un delete refusé
      // par la RLS rend 0 ligne SANS erreur ; il faut `.select('id')` et une
      // erreur si 0 ligne. BudgetContent affiche alors « Budget 2026
      // supprimé » alors que rien n'a bougé (budget = grade admin en RLS).
      initialiser({ budget: [{ id: 1, year: 2026, month: 1 }] })
      etat.sim.refuser('budget', 'delete')
      await expect(daily.deleteYearBudget(2026)).rejects.toThrow()
      expect(etat.sim.table('budget')).toHaveLength(1)
    },
  )
})

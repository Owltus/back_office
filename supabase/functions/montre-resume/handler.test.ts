// Tests de `montre-resume` (handler.ts, source.ts, regles.ts).
//
// Lancer : `deno test --no-check supabase/functions/montre-resume/`
//
// Aucune base ni réseau : la source est un faux injecté. Les oracles sont le
// CONTRAT convenu avec la session de la montre (réponses, champs, unités) et
// les calculs de l'écran (SummaryCards.tsx, BreakfastBoard.tsx), recalculés à
// la main ici, jamais relus dans la sortie.

import { assert, assertEquals } from 'jsr:@std/assert@1'

import { traiter } from './handler.ts'
import type { Dependances } from './handler.ts'
import { COLONNES, sourceSupabase } from './source.ts'
import type { Source } from './source.ts'
import { ALL_ROOMS, comptesPdj, resumeRep } from './regles.ts'

const CLE = 'cle-de-test-montre-0123456789abcdef'
// 16/10/2026 08:00 à Paris (UTC+2) : jour hôtelier du 16, REP jour du 15.
const MATIN = new Date('2026-10-16T06:00:00Z')

const RAPPORT = {
  rj_to: 78.75,
  rj_room_revenue: 6000,
  rmtd_room_revenue: 90000,
  pm_room_revenue: 180000,
}

type Faux = Partial<{ [K in keyof Source]: Source[K] }>

function source(faux: Faux = {}): Source {
  return {
    rapport: async () => RAPPORT,
    dernierCumulDuMois: async () => 80000,
    forecastMois: async () => 170000,
    budgetMois: async () => 200000,
    pdj: async () => [
      { room: 102, status: 'IN HOUSE', breakfasts_included: 2 },
      { room: 103, status: 'DUE OUT', breakfasts_included: 1 },
      { room: 104, status: 'CHECKED OUT', breakfasts_included: 0 },
    ],
    ...faux,
  }
}

function deps(
  s: Source = source(),
  variables: Record<string, string | undefined> = {},
): Dependances & { lectures: number } {
  const env: Record<string, string | undefined> = {
    MONTRE_CLE: CLE,
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'cle-locale',
    ...variables,
  }
  const d = {
    lectures: 0,
    lire: (n: string) => env[n],
    creerSource: () => {
      d.lectures++
      return s
    },
    maintenant: () => MATIN,
  }
  return d
}

const get = (cle: string | null = CLE, methode = 'GET') =>
  new Request('http://local/montre-resume', {
    method: methode,
    headers: cle == null ? {} : { 'X-Montre-Cle': cle },
  })

async function appeler(req: Request, d = deps()) {
  const original = console.error
  const logs: unknown[][] = []
  console.error = (...a: unknown[]) => void logs.push(a)
  try {
    const r = await traiter(req, d)
    return { status: r.status, headers: r.headers, corps: await r.json(), logs }
  } finally {
    console.error = original
  }
}

// ─── Barrière ─────────────────────────────────────────────────────────────

Deno.test('clé absente : 401, aucune lecture', async () => {
  const d = deps()
  const r = await appeler(get(null), d)
  assertEquals(r.status, 401)
  assertEquals(r.corps, { error: 'Non autorisé' })
  assertEquals(d.lectures, 0)
})

Deno.test('clé fausse, vide ou préfixe : même 401, aucune lecture', async () => {
  for (const mauvaise of ['faux', '', CLE.slice(0, -1), CLE + 'x', CLE.toUpperCase()]) {
    const d = deps()
    const r = await appeler(get(mauvaise), d)
    assertEquals(r.status, 401, mauvaise)
    assertEquals(r.corps, { error: 'Non autorisé' })
    assertEquals(d.lectures, 0)
  }
})

Deno.test('autre méthode que GET : 405, même avec la bonne clé', async () => {
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']) {
    const d = deps()
    const r = await traiter(get(CLE, m), d)
    assertEquals(r.status, 405, m)
    assertEquals(d.lectures, 0)
  }
})

Deno.test('MONTRE_CLE absent ou vide : 500, jamais ouvert', async () => {
  for (const v of [undefined, '']) {
    const r = await appeler(get(''), deps(source(), { MONTRE_CLE: v }))
    assertEquals(r.status, 500)
  }
})

Deno.test('pas de CORS, no-store, JSON', async () => {
  const r = await appeler(get())
  assertEquals(r.status, 200)
  assertEquals(r.headers.get('Cache-Control'), 'no-store')
  assertEquals(r.headers.get('Content-Type'), 'application/json')
  assertEquals(r.headers.get('Access-Control-Allow-Origin'), null)
})

// ─── Contenu ──────────────────────────────────────────────────────────────

Deno.test('cas nominal : chiffres de l’écran, en % du budget', async () => {
  const r = await appeler(get())
  // precedent = 90000 − 6000 = 84000 → 42 % ; veille 6000 → 3 % ;
  // projete = 180000 − 90000 = 90000 → 45 % (budget 200000).
  assertEquals(r.corps, {
    rep: {
      date: '2026-10-15',
      partiel: false,
      pct_precedent: 42,
      pct_veille: 3,
      pct_projete: 45,
      to: 78.8,
    },
    pdj: { date: '2026-10-16', disponible: true, restent: 1, departs: 2, inclus: 3 },
  })
})

Deno.test('sortie en liste blanche : aucune clé inattendue, à aucun niveau', async () => {
  // Même si la source renvoie des champs en trop (nom du client, montants),
  // rien d'autre que le contrat ne sort.
  const bavarde = source({
    rapport: async () => ({ ...RAPPORT, rj_nuitees: 63, guest_name: 'X' } as typeof RAPPORT),
    pdj: async () => [
      { room: 102, status: 'IN HOUSE', breakfasts_included: 2, guest_name: 'Dupont' } as never,
    ],
  })
  const r = await appeler(get(), deps(bavarde))
  assertEquals(Object.keys(r.corps).sort(), ['pdj', 'rep'])
  assertEquals(Object.keys(r.corps.rep).sort(), [
    'date', 'partiel', 'pct_precedent', 'pct_projete', 'pct_veille', 'to',
  ])
  assertEquals(Object.keys(r.corps.pdj).sort(), [
    'date', 'departs', 'disponible', 'inclus', 'restent',
  ])
  const texte = JSON.stringify(r.corps)
  assert(!texte.includes('Dupont') && !texte.includes('guest'), texte)
  assert(!texte.includes('6000') && !texte.includes('200000'), 'aucun euro')
})

Deno.test('rapport absent : mode partiel comme l’écran', async () => {
  const r = await appeler(get(), deps(source({ rapport: async () => null })))
  // acquis = dernier cumul 80000 → 40 % ; projete = 170000 − 80000 → 45 %.
  assertEquals(r.corps.rep, {
    date: '2026-10-15',
    partiel: true,
    pct_precedent: 40,
    pct_veille: null,
    pct_projete: 45,
    to: null,
  })
})

Deno.test('rapport absent et mois vide : partiel, 0 % mais pas d’erreur', async () => {
  const r = await appeler(get(), deps(source({
    rapport: async () => null,
    dernierCumulDuMois: async () => null,
    forecastMois: async () => null,
  })))
  assertEquals(r.status, 200)
  assertEquals(r.corps.rep.pct_precedent, 0)
  assertEquals(r.corps.rep.pct_projete, 0)
})

Deno.test('budget absent ou nul : pourcentages à null, reste intact', async () => {
  for (const b of [null, 0]) {
    const r = await appeler(get(), deps(source({ budgetMois: async () => b })))
    assertEquals(r.status, 200)
    assertEquals(r.corps.rep.pct_precedent, null)
    assertEquals(r.corps.rep.pct_veille, null)
    assertEquals(r.corps.rep.pct_projete, null)
    assertEquals(r.corps.rep.to, 78.8)
  }
})

Deno.test('PDJ absent : disponible=false, compteurs à 0', async () => {
  const r = await appeler(get(), deps(source({ pdj: async () => [] })))
  assertEquals(r.corps.pdj, {
    date: '2026-10-16', disponible: false, restent: 0, departs: 0, inclus: 0,
  })
})

Deno.test('panne de base, quelle que soit la lecture : 503 sans détail ni clé', async () => {
  const panne = async () => {
    throw new Error('daily_reports : connexion refusée')
  }
  for (const k of ['rapport', 'budgetMois', 'pdj'] as const) {
    const r = await appeler(get(), deps(source({ [k]: panne })))
    assertEquals(r.status, 503, k)
    assertEquals(r.corps, { error: 'Service indisponible' })
    assert(!JSON.stringify(r.logs).includes(CLE), 'clé journalisée')
  }
  const partiel = await appeler(get(), deps(source({
    rapport: async () => null,
    forecastMois: panne,
  })))
  assertEquals(partiel.status, 503)
})

Deno.test('jour hôtelier : avant 02h Paris, on reste sur la veille', async () => {
  const d = deps()
  d.maintenant = () => new Date('2026-10-15T23:30:00Z') // 16/10 01:30 Paris
  const r = await appeler(get(), d)
  assertEquals(r.corps.pdj.date, '2026-10-15')
  assertEquals(r.corps.rep.date, '2026-10-14')
})

Deno.test('changement de mois : budget du mois du RAPPORT', async () => {
  const vus: string[] = []
  const d = deps(source({
    budgetMois: async (a, m) => {
      vus.push(`${a}-${m}`)
      return 200000
    },
  }))
  d.maintenant = () => new Date('2026-11-01T08:00:00Z') // 1er novembre
  const r = await appeler(get(), d)
  assertEquals(r.corps.rep.date, '2026-10-31')
  assertEquals(vus, ['2026-10'])
})

// ─── Règles ───────────────────────────────────────────────────────────────

Deno.test('comptes PDJ : chambres hors liste ignorées, statuts inconnus non comptés', () => {
  assertEquals(ALL_ROOMS.length, 80)
  const c = comptesPdj([
    { room: 999, status: 'IN HOUSE', breakfasts_included: 5 },
    { room: 101, status: 'DUE OUT', breakfasts_included: 5 },
    { room: 201, status: 'DUE IN', breakfasts_included: 1 },
    { room: 202, status: null, breakfasts_included: null },
  ])
  assertEquals(c, { disponible: true, restent: 0, departs: 0, inclus: 1 })
})

Deno.test('barre : rien de négatif quand le projeté passe sous le cumul', () => {
  const r = resumeRep({
    rapport: { rj_to: 50, rj_room_revenue: 9000, rmtd_room_revenue: 5000, pm_room_revenue: 4000 },
    dernierCumulDuMois: null,
    forecastMois: null,
    budgetMois: 10000,
  })
  assertEquals(r.pct_precedent, 0)
  assertEquals(r.pct_projete, 0)
  assertEquals(r.pct_veille, 90)
})

// ─── Lectures ─────────────────────────────────────────────────────────────

/** Faux client supabase-js : enregistre table, colonnes et filtres. */
function fauxClient(reponse: { data: unknown; error: { message: string } | null }) {
  const appels: { table: string; select?: string; filtres: string[] }[] = []
  const client = {
    from(table: string) {
      const a = { table, select: undefined as string | undefined, filtres: [] as string[] }
      appels.push(a)
      const q = {
        select(c: string) { a.select = c; return q },
        eq(k: string, v: unknown) { a.filtres.push(`${k}=${v}`); return q },
        order() { return q },
        limit() { return q },
        maybeSingle: () => Promise.resolve(reponse),
        then: (ok: (r: unknown) => unknown, ko: (e: unknown) => unknown) =>
          Promise.resolve(reponse).then(ok, ko),
      }
      return q
    },
  }
  return { client, appels }
}

Deno.test('lectures : colonnes explicites, jamais * ni guest_name', async () => {
  const { client, appels } = fauxClient({ data: [], error: null })
  const s = sourceSupabase(client)
  await s.pdj('2026-10-16')
  await s.forecastMois(2026, 10)
  const f2 = fauxClient({ data: null, error: null })
  const s2 = sourceSupabase(f2.client)
  await s2.rapport('2026-10-15')
  await s2.budgetMois(2026, 10)
  await s2.dernierCumulDuMois(2026, 10)
  const tous = [...appels, ...f2.appels]
  assertEquals(tous.length, 5)
  for (const a of tous) {
    assert(a.select && a.select !== '*' && !a.select.includes('guest'), a.select)
  }
  assertEquals(appels[0], {
    table: 'pdj_breakfasts', select: COLONNES.pdj, filtres: ['service_date=2026-10-16'],
  })
  assertEquals(f2.appels[0].filtres, ['date=2026-10-15'])
})

Deno.test('lectures : une erreur lève (→ 503), jamais un « vide »', async () => {
  const { client } = fauxClient({ data: null, error: { message: 'timeout' } })
  const s = sourceSupabase(client)
  for (const appel of [
    () => s.rapport('2026-10-15'),
    () => s.pdj('2026-10-16'),
    () => s.budgetMois(2026, 10),
    () => s.forecastMois(2026, 10),
    () => s.dernierCumulDuMois(2026, 10),
  ]) {
    let leve = false
    try { await appel() } catch { leve = true }
    assert(leve)
  }
})

Deno.test('forecast : null sans prévision, somme sinon', async () => {
  assertEquals(await sourceSupabase(fauxClient({ data: [], error: null }).client).forecastMois(2026, 10), null)
  assertEquals(
    await sourceSupabase(
      fauxClient({ data: [{ rev_ttc: 100 }, { rev_ttc: null }, { rev_ttc: 50.5 }], error: null }).client,
    ).forecastMois(2026, 10),
    150.5,
  )
})

/*
 * Générateur du seed LOCAL (plan environnement-dev-docker-2026-10-12, étape 5).
 *
 * Produit `supabase/seed.sql`, rejoué par `supabase db reset` après les
 * migrations. TOUTES les données sont INVENTÉES : aucune lecture de la prod,
 * aucun vrai nom, toutes les adresses en `@exemple.test`.
 *
 *   npx tsx supabase/seed/generer.ts                 (date du jour, Paris)
 *   npx tsx supabase/seed/generer.ts --date=2026-10-13 --graine=20261013
 *   node --experimental-strip-types supabase/seed/generer.ts
 *
 * Déterminisme : PRNG maison (mulberry32), jamais Math.random ; un flux par
 * domaine (`flux('pdj')`…), pour qu'ajouter une table ne change pas les autres.
 * Même graine + même date → même SQL, octet pour octet.
 *
 * Fenêtre : 90 jours, de J-75 à J+14 (J = la date passée). Toute colonne de
 * date d'une ligne générée tombe dans cette fenêtre.
 *
 * Le cœur (`genererDonnees`, `versSql`, `genererSeed`) est PUR : il ne lit ni
 * l'horloge ni le disque. Les référentiels versionnés (`supabase/*.sql`) sont
 * lus par `lireReferentiels` et passés en paramètre.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const GRAINE_PAR_DEFAUT = 20261013
export const JOURS_AVANT = 75
export const JOURS_APRES = 14
export const DOMAINE = 'exemple.test'
/** Mot de passe commun des 6 comptes de test — LOCAL SEULEMENT. Respecte la
 * règle de config.toml : 12 caractères, minuscule + majuscule + chiffre. */
export const MOT_DE_PASSE = 'DevLocal2026x'
export const TOTAL_CHAMBRES = 80

export const PAGES = [
  'repjour',
  'pdj',
  'parking',
  'rapro',
  'caisse',
  'affichage',
  'facturation',
  'literie',
  'classeur',
  'planning',
] as const
export type Page = (typeof PAGES)[number]
export type Niveau = 'lecture' | 'ecriture' | 'gestion'

/** Les 80 chambres (miroir de literie.sql / src/lib/hotel/rooms.ts). */
export const CHAMBRES: ReadonlyArray<number> = [
  ...plage(102, 114),
  ...plage(201, 214),
  ...plage(301, 314),
  ...plage(401, 414),
  ...plage(501, 514),
  ...plage(621, 631),
]

function plage(a: number, b: number): number[] {
  const out: number[] = []
  for (let i = a; i <= b; i++) out.push(i)
  return out
}

// ---------------------------------------------------------------------------
// PRNG déterministe (mulberry32) et flux nommés
// ---------------------------------------------------------------------------

export interface Alea {
  reel(): number
  entier(min: number, max: number): number
  chance(p: number): boolean
  choix<T>(liste: ReadonlyArray<T>): T
  pondere<T>(liste: ReadonlyArray<readonly [T, number]>): T
  uuid(): string
}

export function creerAlea(graine: number): Alea {
  let etat = graine >>> 0
  const reel = (): number => {
    etat = (etat + 0x6d2b79f5) >>> 0
    let t = etat
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const entier = (min: number, max: number): number =>
    min + Math.floor(reel() * (max - min + 1))
  return {
    reel,
    entier,
    chance: (p) => reel() < p,
    choix: (liste) => liste[Math.floor(reel() * liste.length)],
    pondere: (liste) => {
      const total = liste.reduce((s, [, p]) => s + p, 0)
      let r = reel() * total
      for (const [v, p] of liste) {
        r -= p
        if (r < 0) return v
      }
      return liste[liste.length - 1][0]
    },
    uuid: () => {
      const o: number[] = []
      for (let i = 0; i < 16; i++) o.push(entier(0, 255))
      o[6] = (o[6] & 0x0f) | 0x40
      o[8] = (o[8] & 0x3f) | 0x80
      const h = o.map((b) => b.toString(16).padStart(2, '0')).join('')
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
    },
  }
}

/** FNV-1a 32 bits : dérive la graine d'un flux nommé. */
function hacher(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// ---------------------------------------------------------------------------
// Dates (UTC pur, jamais l'horloge)
// ---------------------------------------------------------------------------

const JOUR_MS = 86_400_000

export function versJour(iso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso))
    throw new Error(`Date invalide : ${iso}`)
  const [a, m, j] = iso.split('-').map(Number)
  const t = Date.UTC(a, m - 1, j)
  const d = new Date(t)
  if (
    d.getUTCFullYear() !== a ||
    d.getUTCMonth() !== m - 1 ||
    d.getUTCDate() !== j
  ) {
    throw new Error(`Date invalide : ${iso}`)
  }
  return Math.round(t / JOUR_MS)
}

export function versIso(jour: number): string {
  return new Date(jour * JOUR_MS).toISOString().slice(0, 10)
}

function anneeDe(jour: number): number {
  return new Date(jour * JOUR_MS).getUTCFullYear()
}
function moisDe(jour: number): number {
  return new Date(jour * JOUR_MS).getUTCMonth() + 1
}
function jourDuMois(jour: number): number {
  return new Date(jour * JOUR_MS).getUTCDate()
}
function joursDansMois(annee: number, mois: number): number {
  return new Date(Date.UTC(annee, mois, 0)).getUTCDate()
}
/** 0 = dimanche … 6 = samedi. */
function jourSemaine(jour: number): number {
  return new Date(jour * JOUR_MS).getUTCDay()
}

/** Horodatage local de Paris, lu tel quel par Postgres (timestamptz). */
function horodatage(jour: number, h: number, m = 0): string {
  return `${versIso(jour)} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00 Europe/Paris`
}

const arrondi2 = (x: number): number => Math.round(x * 100) / 100

// ---------------------------------------------------------------------------
// Modèle de données : des tables ordonnées, prêtes à écrire
// ---------------------------------------------------------------------------

export interface Brut {
  readonly brut: string
}
export type Val = string | number | boolean | null | Brut
const brut = (s: string): Brut => ({ brut: s })

export interface Table {
  /** Nom qualifié : `public.x` ou `auth.users`. */
  nom: string
  colonnes: string[]
  lignes: Val[][]
  /** `overriding system value` (colonnes `generated always as identity`). */
  identiteForcee?: boolean
  /** Commentaire SQL posé au-dessus de l'insertion. */
  note?: string
}

export interface Fenetre {
  debut: number
  fin: number
  aujourdhui: number
}

export interface Donnees {
  graine: number
  fenetre: Fenetre
  tables: Table[]
  /** Instructions SQL à jouer APRÈS les insertions (mises à jour de
   * référentiels, setval). */
  apres: string[]
}

function table(nom: string, colonnes: string[], note?: string): Table {
  return { nom, colonnes, lignes: [], note }
}

/** Valeur d'une colonne pour toutes les lignes d'une table (tests). */
export function colonne(t: Table, nom: string): Val[] {
  const i = t.colonnes.indexOf(nom)
  if (i === -1) throw new Error(`${t.nom} : colonne inconnue ${nom}`)
  return t.lignes.map((l) => l[i])
}

export function trouverTable(d: Donnees, nom: string): Table {
  const t = d.tables.find((x) => x.nom === nom)
  if (!t) throw new Error(`Table absente : ${nom}`)
  return t
}

// ---------------------------------------------------------------------------
// Comptes
// ---------------------------------------------------------------------------

export interface Compte {
  id: string
  cle: string
  email: string
  prenom: string
  nom: string
  role: 'admin' | 'utilisateur'
  droits: ReadonlyArray<readonly [Page, Niveau]>
}

const tous = (n: Niveau): Array<readonly [Page, Niveau]> =>
  PAGES.map((p) => [p, n] as const)

export const COMPTES: ReadonlyArray<Compte> = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    cle: 'admin',
    email: `admin@${DOMAINE}`,
    prenom: 'Admin',
    nom: 'Test',
    role: 'admin',
    droits: [], // admin = gestion partout (private.get_page_level)
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    cle: 'gestion',
    email: `gestion@${DOMAINE}`,
    prenom: 'Gestion',
    nom: 'Test',
    role: 'utilisateur',
    droits: tous('gestion'),
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    cle: 'ecriture',
    email: `ecriture@${DOMAINE}`,
    prenom: 'Écriture',
    nom: 'Test',
    role: 'utilisateur',
    droits: tous('ecriture'),
  },
  {
    id: 'a0000000-0000-4000-8000-000000000004',
    cle: 'lecture',
    email: `lecture@${DOMAINE}`,
    prenom: 'Lecture',
    nom: 'Test',
    role: 'utilisateur',
    droits: tous('lecture'),
  },
  {
    id: 'a0000000-0000-4000-8000-000000000005',
    cle: 'aucun',
    email: `aucun@${DOMAINE}`,
    prenom: 'Aucun',
    nom: 'Test',
    role: 'utilisateur',
    droits: [],
  },
  {
    id: 'a0000000-0000-4000-8000-000000000006',
    cle: 'reception',
    email: `reception@${DOMAINE}`,
    prenom: 'Réception',
    nom: 'Test',
    role: 'utilisateur',
    // Profil du compte partagé de la réception : l'opérationnel en écriture,
    // le reporting et les classeurs en lecture, pas de facturation.
    droits: [
      ['repjour', 'lecture'],
      ['pdj', 'ecriture'],
      ['parking', 'ecriture'],
      ['rapro', 'ecriture'],
      ['caisse', 'ecriture'],
      ['affichage', 'ecriture'],
      ['literie', 'ecriture'],
      ['classeur', 'lecture'],
    ],
  },
]

const ADMIN = COMPTES[0].id
const RECEPTION = COMPTES[5].id

function genererComptes(f: Fenetre, tables: Table[]): void {
  const users = table(
    'auth.users',
    [
      'instance_id',
      'id',
      'aud',
      'role',
      'email',
      'encrypted_password',
      'email_confirmed_at',
      'raw_app_meta_data',
      'raw_user_meta_data',
      'created_at',
      'updated_at',
      'confirmation_token',
      'recovery_token',
      'email_change_token_new',
      'email_change',
      'email_change_token_current',
      'phone_change',
      'phone_change_token',
      'reauthentication_token',
    ],
    // GoTrue refuse un NULL dans les colonnes de jetons (« converting NULL to
    // string is unsupported ») : elles sont posées à '' explicitement.
    `Comptes de test (mot de passe commun : ${MOT_DE_PASSE}). Hash bcrypt calculé à l'insertion.`,
  )
  const identites = table('auth.identities', [
    'id',
    'provider_id',
    'user_id',
    'identity_data',
    'provider',
    'last_sign_in_at',
    'created_at',
    'updated_at',
  ])
  const profils = table('public.profiles', [
    'id',
    'email',
    'display_name',
    'role',
    'created_at',
    'first_name',
    'last_name',
  ])
  const droits = table('public.user_page_permissions', [
    'user_id',
    'page',
    'level',
    'updated_at',
    'updated_by',
  ])
  COMPTES.forEach((c, i) => {
    // created_at croissant : verif_classeur_acces.sql prend les trois premiers
    // comptes non admin par date de création.
    const cree = horodatage(f.debut - 30, 9, i)
    users.lignes.push([
      '00000000-0000-0000-0000-000000000000',
      c.id,
      'authenticated',
      'authenticated',
      c.email,
      brut(`extensions.crypt('${MOT_DE_PASSE}', extensions.gen_salt('bf'))`),
      cree,
      '{"provider":"email","providers":["email"]}',
      '{"email_verified":true}',
      cree,
      cree,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ])
    identites.lignes.push([
      c.id.replace(/^a/, 'b'),
      c.id,
      c.id,
      JSON.stringify({
        sub: c.id,
        email: c.email,
        email_verified: true,
        phone_verified: false,
      }),
      'email',
      null,
      cree,
      cree,
    ])
    profils.lignes.push([
      c.id,
      c.email,
      `${c.prenom} ${c.nom}`,
      c.role,
      cree,
      c.prenom,
      c.nom,
    ])
    for (const [page, niveau] of c.droits) {
      droits.lignes.push([c.id, page, niveau, cree, ADMIN])
    }
  })
  tables.push(users, identites, profils, droits)
}

// ---------------------------------------------------------------------------
// Séjours : la colonne vertébrale (RepJour, PDJ, parking, rapprochement)
// ---------------------------------------------------------------------------

export interface Sejour {
  chambre: number
  arrivee: number
  /** Jour de départ (exclu des nuits). */
  depart: number
  adultes: number
  enfants: number
  client: string
  tarif: string
  addons: string | null
  canal: string | null
  societe: string | null
  adr: number
  vip: boolean
  sejoursPasses: number
}

const TARIFS: ReadonlyArray<readonly [string, number]> = [
  ['BAR', 30],
  ['BAR BB1PAX', 12],
  ['BAR BB2PAX', 14],
  ['CORPO', 12],
  ['CORPO PDJ INCLUS 2 PAX', 8],
  ['OTA NR', 15],
  ['GROUPE', 6],
  ['STAFF', 3],
]

function clientTest(n: number): string {
  return `Client Test ${String(n).padStart(4, '0')}`
}

function genererSejours(f: Fenetre, graine: number): Sejour[] {
  const a = creerAlea(graine ^ hacher('sejours'))
  const sejours: Sejour[] = []
  let numero = 0
  for (const chambre of CHAMBRES) {
    let curseur = f.debut
    // État initial : la chambre est déjà occupée le premier soir ou non.
    if (!a.chance(0.8)) curseur += a.entier(1, 2)
    while (curseur < f.fin) {
      const nuits = Math.min(
        a.pondere<number>([
          [1, 35],
          [2, 30],
          [3, 18],
          [4, 9],
          [5, 5],
          [6, 3],
        ]),
        f.fin - curseur,
      )
      const tarif = a.pondere(TARIFS)
      const adultes = a.chance(0.55) ? 2 : 1
      const enfants = adultes === 2 && a.chance(0.1) ? 1 : 0
      let addons: string | null = null
      if (tarif === 'GROUPE') addons = 'PDJGROUP10'
      else if (/BB|PDJ/.test(tarif)) addons = a.chance(0.3) ? 'PDJBB' : 'PDJ'
      else if (a.chance(0.3)) addons = 'PDJ'
      numero++
      sejours.push({
        chambre,
        arrivee: curseur,
        depart: curseur + nuits,
        adultes,
        enfants,
        client: clientTest(numero),
        tarif,
        addons,
        canal: a.pondere<string | null>([
          ['BOOKING.COM', 35],
          ['EXPEDIA', 15],
          ['DIRECT', 25],
          ['SITE WEB', 20],
          [null, 5],
        ]),
        societe: tarif === 'CORPO' || a.chance(0.05) ? a.choix(SOCIETES) : null,
        adr: arrondi2(a.entier(8900, 16900) / 100),
        vip: a.chance(0.03),
        sejoursPasses: a.pondere<number>([
          [1, 70],
          [2, 15],
          [3, 8],
          [5, 7],
        ]),
      })
      curseur += nuits
      curseur += a.pondere<number>([
        [0, 55],
        [1, 28],
        [2, 10],
        [3, 7],
      ])
    }
  }
  return sejours
}

const SOCIETES = [
  'Société Fictive Alpha',
  'Société Fictive Bêta',
  'Entreprise Exemple',
  'Groupe Démo',
]

/** Séjour qui occupe la chambre la NUIT `jour` (arrivée ≤ jour < départ). */
function index(sejours: Sejour[]): Map<number, Sejour[]> {
  const parChambre = new Map<number, Sejour[]>()
  for (const s of sejours) {
    const l = parChambre.get(s.chambre) ?? []
    l.push(s)
    parChambre.set(s.chambre, l)
  }
  return parChambre
}

function occupant(
  liste: Sejour[] | undefined,
  nuit: number,
): Sejour | undefined {
  return liste?.find((s) => s.arrivee <= nuit && nuit < s.depart)
}

/** Règle des PDJ inclus (miroir de pdj_clamp_breakfasts_included). */
export function pdjInclus(
  addons: string | null,
  tarif: string | null,
  adultes: number,
  enfants: number,
): number {
  if (!(addons ?? '').toUpperCase().includes('PDJ')) return 0
  const m = (tarif ?? '').toUpperCase().match(/([0-9]+)\s*PAX/)
  const pax = m ? parseInt(m[1], 10) : adultes
  return Math.min(pax, adultes + enfants, 2)
}

/** Code produit d'une ligne (miroir de la vue pdj_daily_agg). */
function codePdj(
  tarif: string | null,
  addons: string | null,
  manuel: string | null,
): string | null {
  const t = (tarif ?? '').toUpperCase()
  const a = (addons ?? '').toUpperCase()
  if (t.includes('STAFF')) return null
  if (a.includes('PDJGROUP')) return 'PDJGROUP10'
  if (a.includes('PDJBB')) return 'PDJBB'
  if (a.includes('PDJ')) return 'PDJ'
  if (manuel === 'inclus') return 'PDJ'
  return null
}

const PRIX_PDJ: Record<string, number> = { PDJ: 19, PDJBB: 10, PDJGROUP10: 10 }

// ---------------------------------------------------------------------------
// RepJour : hotel_config, budget, forecast_days, daily_reports
// ---------------------------------------------------------------------------

function genererRepjour(
  f: Fenetre,
  sejours: Sejour[],
  graine: number,
  tables: Table[],
): void {
  const a = creerAlea(graine ^ hacher('repjour'))
  const parChambre = index(sejours)
  const occupation = (nuit: number): { n: number; ca: number } => {
    let n = 0
    let ca = 0
    for (const ch of CHAMBRES) {
      const s = occupant(parChambre.get(ch), nuit)
      if (s && s.tarif !== 'STAFF') {
        n++
        ca += s.adr
      }
    }
    return { n, ca: arrondi2(ca) }
  }

  const config = table('public.hotel_config', [
    'id',
    'name',
    'code',
    'total_rooms',
    'updated_at',
  ])
  config.lignes.push([
    1,
    'Hôtel de démonstration (local)',
    '4401',
    TOTAL_CHAMBRES,
    horodatage(f.debut, 8),
  ])
  tables.push(config)

  // Budget : les 12 mois de chaque année touchée par la fenêtre.
  const budget = table('public.budget', [
    'year',
    'month',
    'nuitees',
    'taux_occupation',
    'prix_moyen',
    'revpar',
    'room_revenue',
    'updated_at',
  ])
  const TO_MOIS = [62, 66, 72, 76, 80, 84, 78, 70, 82, 81, 74, 64]
  const PM_MOIS = [98, 102, 108, 115, 122, 128, 120, 112, 126, 124, 110, 104]
  for (let annee = anneeDe(f.debut); annee <= anneeDe(f.fin); annee++) {
    for (let mois = 1; mois <= 12; mois++) {
      const jours = joursDansMois(annee, mois)
      const to = TO_MOIS[mois - 1]
      const nuitees = Math.round((jours * TOTAL_CHAMBRES * to) / 100)
      const pm = PM_MOIS[mois - 1]
      const ca = nuitees * pm
      budget.lignes.push([
        annee,
        mois,
        nuitees,
        to,
        pm,
        arrondi2(ca / (jours * TOTAL_CHAMBRES)),
        ca,
        horodatage(f.debut, 8),
      ])
    }
  }
  tables.push(budget)

  // Forecast : un import du jour, qui couvre toute la fenêtre.
  const forecast = table('public.forecast_days', [
    'date',
    'month',
    'year',
    'occ',
    'rev_ht',
    'rev_ttc',
    'adr_ttc',
    'occ_percent',
    'imported_at',
  ])
  for (let j = f.debut; j <= f.fin; j++) {
    const o = occupation(j)
    // Le passé tel qu'il était prévu (léger écart), le futur tel que réservé.
    const n =
      j < f.aujourdhui
        ? Math.max(0, Math.min(TOTAL_CHAMBRES, o.n + a.entier(-3, 3)))
        : o.n
    const ht = n === 0 ? 0 : arrondi2((o.ca / Math.max(o.n, 1)) * n)
    const ttc = arrondi2(ht * 1.1)
    forecast.lignes.push([
      versIso(j),
      moisDe(j),
      anneeDe(j),
      n,
      ht,
      ttc,
      n === 0 ? 0 : arrondi2(ttc / n),
      arrondi2((n / TOTAL_CHAMBRES) * 100),
      horodatage(f.aujourdhui, 3, 5),
    ])
  }
  tables.push(forecast)

  // Rapports journaliers : chaque jour passé (le rapport de J arrive à J+1).
  const rapports = table('public.daily_reports', [
    'date',
    'month',
    'year',
    'day_of_month',
    'days_in_month',
    'rj_nuitees',
    'rj_to',
    'rj_pm',
    'rj_revpar',
    'rj_room_revenue',
    'rmtd_nuitees',
    'rmtd_to',
    'rmtd_pm',
    'rmtd_revpar',
    'rmtd_room_revenue',
    'pm_nuitees',
    'pm_to',
    'pm_pm',
    'pm_revpar',
    'pm_room_revenue',
    'imported_at',
    'imported_by',
    'alerts',
    'auto_sent_at',
  ])
  const envois = table('public.repjour_auto_send_log', [
    'cycle_date',
    'trigger_report',
    'attempt',
    'waited_seconds',
    'sent',
    'retryable',
    'note',
    'created_at',
  ])
  const indic = (n: number, ca: number, chambres: number) => ({
    to: chambres === 0 ? 0 : arrondi2((n / chambres) * 100),
    pm: n === 0 ? 0 : arrondi2(ca / n),
    revpar: chambres === 0 ? 0 : arrondi2(ca / chambres),
  })
  for (let j = f.debut; j < f.aujourdhui; j++) {
    const o = occupation(j)
    const dm = jourDuMois(j)
    const jm = joursDansMois(anneeDe(j), moisDe(j))
    // Cumul du mois : les jours du mois antérieurs à la fenêtre sont estimés
    // (62 chambres à 118 €), pour qu'un mois entamé ne parte pas de zéro.
    let cn = 0
    let cca = 0
    for (let k = j - dm + 1; k <= j; k++) {
      if (k < f.debut) {
        cn += 62
        cca += 62 * 118
      } else {
        const ok = occupation(k)
        cn += ok.n
        cca += ok.ca
      }
    }
    cca = arrondi2(cca)
    const pn = Math.round((cn / dm) * jm)
    const pca = arrondi2((cca / dm) * jm)
    const rj = indic(o.n, o.ca, TOTAL_CHAMBRES)
    const mtd = indic(cn, cca, TOTAL_CHAMBRES * dm)
    const pm = indic(pn, pca, TOTAL_CHAMBRES * jm)
    rapports.lignes.push([
      versIso(j),
      moisDe(j),
      anneeDe(j),
      dm,
      jm,
      o.n,
      rj.to,
      rj.pm,
      rj.revpar,
      o.ca,
      cn,
      mtd.to,
      mtd.pm,
      mtd.revpar,
      cca,
      pn,
      pm.to,
      pm.pm,
      pm.revpar,
      pca,
      horodatage(j + 1, 3, a.entier(2, 9)),
      null,
      '[]',
      horodatage(j + 1, 7, a.entier(0, 4)),
    ])
    if (j >= f.aujourdhui - 7) {
      envois.lignes.push([
        versIso(j + 1),
        'comparison',
        1,
        0,
        true,
        false,
        'Envoi automatique (données fictives)',
        horodatage(j + 1, 7),
      ])
    }
  }
  tables.push(rapports, envois)

  const destinataires = table('public.server_report_recipients', [
    'email',
    'name',
    'type',
    'active',
    'created_at',
  ])
  destinataires.lignes.push([
    `rapport@${DOMAINE}`,
    'Rapport (test)',
    'to',
    true,
    horodatage(f.debut, 8),
  ])
  tables.push(destinataires)
}

// ---------------------------------------------------------------------------
// Petit-déjeuner
// ---------------------------------------------------------------------------

export interface LignePdj {
  service: number
  chambre: number
  inclus: number
  servis: number
  offerts: number
}

function genererPdj(
  f: Fenetre,
  sejours: Sejour[],
  graine: number,
  tables: Table[],
): void {
  const a = creerAlea(graine ^ hacher('pdj'))
  const parChambre = index(sejours)
  const pdj = table('public.pdj_breakfasts', [
    'id',
    'service_date',
    'room',
    'guest_name',
    'status',
    'vip',
    'adults',
    'children',
    'guests',
    'no_of_nights',
    'room_type',
    'rate_plan',
    'channel',
    'company',
    'guarantee',
    'payment_type',
    'addons',
    'adr',
    'arrival_date',
    'departure_date',
    'stay_count',
    'breakfasts_included',
    'breakfasts_served',
    'served',
    'source_file',
    'imported_at',
    'purged_at',
    'created_at',
    'updated_at',
    'manual_kind',
    'breakfasts_offert',
  ])
  const addon = table('public.pdj_addon_production', [
    'service_date',
    'code',
    'total_count',
    'revenue_ttc',
    'source_file',
    'imported_at',
  ])
  const externes = table('public.pdj_externals', [
    'service_date',
    'count',
    'created_at',
    'updated_at',
  ])

  // Service du matin `s` : la chambre a été occupée la nuit s-1.
  for (let s = f.debut + 1; s <= f.aujourdhui; s++) {
    const passe = s < f.aujourdhui
    const nomGarde = s >= f.aujourdhui - 1 // purge RGPD : jour même et veille seulement
    const fichier = `In-House Guests _${versIso(s).replace(/-/g, '')}.csv`
    const parCode = new Map<string, number>()
    for (const ch of CHAMBRES) {
      const sej = occupant(parChambre.get(ch), s - 1)
      if (!sej) {
        // Saisie manuelle (day-use, client non enregistré) : rare.
        if (passe && a.chance(0.015)) {
          const kind = a.pondere<'extra' | 'offert' | 'inclus'>([
            ['extra', 60],
            ['offert', 25],
            ['inclus', 15],
          ])
          const servis = a.entier(1, 2)
          const inclus = kind === 'inclus' ? servis : 0
          pdj.lignes.push([
            a.uuid(),
            versIso(s),
            ch,
            null,
            '',
            false,
            servis,
            0,
            servis,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            0,
            inclus,
            servis,
            true,
            null,
            horodatage(s, 9, 30),
            nomGarde ? null : horodatage(s + 1, 3, 15),
            horodatage(s, 9, 30),
            horodatage(s, 9, 30),
            kind,
            0,
          ])
          if (kind === 'inclus')
            parCode.set('PDJ', (parCode.get('PDJ') ?? 0) + inclus)
        }
        continue
      }
      const inclus = pdjInclus(sej.addons, sej.tarif, sej.adultes, sej.enfants)
      const convives = sej.adultes + sej.enfants
      let servis = 0
      if (passe || a.chance(0.5)) {
        servis = a.pondere<number>([
          [inclus, 70],
          [0, 15],
          [Math.min(2, convives), 15],
        ])
      }
      servis = Math.min(servis, 2)
      const offerts =
        servis > inclus && a.chance(0.1) ? Math.min(1, servis - inclus) : 0
      const code = codePdj(sej.tarif, sej.addons, null)
      if (code && passe) parCode.set(code, (parCode.get(code) ?? 0) + inclus)
      pdj.lignes.push([
        a.uuid(),
        versIso(s),
        ch,
        nomGarde ? sej.client : null,
        s < sej.depart ? 'IN HOUSE' : 'DUE OUT',
        sej.vip,
        sej.adultes,
        sej.enfants,
        convives,
        sej.depart - sej.arrivee,
        ch >= 621 ? 'PREMIUM' : 'CLASSIQUE',
        sej.tarif,
        sej.canal,
        sej.societe,
        'CC',
        'CB',
        sej.addons,
        sej.adr,
        versIso(sej.arrivee),
        versIso(sej.depart),
        sej.sejoursPasses,
        inclus,
        servis,
        servis > 0,
        fichier,
        horodatage(s, 3, 10),
        nomGarde ? null : horodatage(s + 1, 3, 15),
        horodatage(s, 3, 10),
        horodatage(s, 10, 30),
        null,
        offerts,
      ])
    }
    if (passe) {
      for (const [code, n] of [...parCode.entries()].sort()) {
        if (n === 0) continue
        // De temps en temps une remise : la recette n'est plus un multiple exact.
        const remise = a.chance(0.05) ? PRIX_PDJ[code] : 0
        addon.lignes.push([
          versIso(s),
          code,
          n,
          arrondi2(n * PRIX_PDJ[code] - remise),
          `Addon Production _${versIso(s).replace(/-/g, '')}.csv`,
          horodatage(s + 1, 3, 12),
        ])
      }
      externes.lignes.push([
        versIso(s),
        a.pondere<number>([
          [0, 50],
          [1, 20],
          [2, 15],
          [3, 10],
          [5, 5],
        ]),
        horodatage(s, 10),
        horodatage(s, 10),
      ])
    }
  }
  tables.push(pdj, addon, externes)
}

// ---------------------------------------------------------------------------
// Parking
// ---------------------------------------------------------------------------

function genererParking(
  f: Fenetre,
  sejours: Sejour[],
  graine: number,
  tables: Table[],
): void {
  const a = creerAlea(graine ^ hacher('parking'))
  const tarifs = table('public.parking_tarifs', [
    'id',
    'price_ttc',
    'vat_rate',
    'effective_from',
    'created_at',
  ])
  tarifs.lignes.push([
    a.uuid(),
    20,
    10,
    versIso(f.debut),
    horodatage(f.debut, 8),
  ])
  tables.push(tarifs)

  const resa = table('public.parking_reservations', [
    'id',
    'spot',
    'client',
    'start_date',
    'nights',
    'status',
    'comment',
    'created_at',
    'updated_at',
  ])
  const parArrivee = new Map<number, Sejour[]>()
  for (const s of sejours) {
    if (s.tarif === 'STAFF') continue
    const l = parArrivee.get(s.arrivee) ?? []
    l.push(s)
    parArrivee.set(s.arrivee, l)
  }
  const pris = new Set<Sejour>()
  // Places 1 à 12 : clientèle. Une place ne porte qu'une réservation par nuit
  // (contrainte parking_reservations_no_overlap).
  for (let place = 1; place <= 12; place++) {
    let curseur = f.debut + a.entier(0, 2)
    while (curseur < f.fin) {
      const candidats = (parArrivee.get(curseur) ?? []).filter(
        (s) => !pris.has(s),
      )
      if (candidats.length === 0 || a.chance(0.25)) {
        curseur++
        continue
      }
      const sej = a.choix(candidats)
      pris.add(sej)
      const nuits = Math.min(sej.depart - sej.arrivee, f.fin - curseur)
      const fin = curseur + nuits
      let statut: string
      if (fin <= f.aujourdhui) {
        statut = a.pondere([
          ['paye', 85],
          ['checkout', 8],
          ['gratuite', 7],
        ])
      } else if (curseur <= f.aujourdhui) {
        statut = a.chance(0.5) ? 'paye' : 'reserve'
      } else {
        statut = 'reserve'
      }
      resa.lignes.push([
        a.uuid(),
        place,
        sej.client,
        versIso(curseur),
        nuits,
        statut,
        a.chance(0.1)
          ? a.choix([
              'Véhicule utilitaire',
              'Arrivée tardive',
              'Recharge électrique demandée',
            ])
          : '',
        horodatage(Math.max(f.debut, curseur - 3), 15),
        horodatage(Math.max(f.debut, curseur - 3), 15),
      ])
      curseur =
        fin +
        a.pondere<number>([
          [0, 40],
          [1, 30],
          [2, 20],
          [4, 10],
        ])
    }
  }
  // Places 13 et 14 : personnel, en semaine.
  for (let place = 13; place <= 14; place++) {
    for (let j = f.debut; j < f.fin; j++) {
      const js = jourSemaine(j)
      if (js === 0 || js === 6 || !a.chance(0.6)) continue
      resa.lignes.push([
        a.uuid(),
        place,
        `Employé Test ${String(place - 12).padStart(2, '0')}`,
        versIso(j),
        1,
        'employe',
        '',
        horodatage(j, 8),
        horodatage(j, 8),
      ])
    }
  }
  tables.push(resa)
}

// ---------------------------------------------------------------------------
// Caisse : feuilles par (date, shift) et cautions
// ---------------------------------------------------------------------------

/** Fond de caisse de 150 € (Σ coupures × valeur, en centimes). */
const FOND: ReadonlyArray<readonly [string, number, number]> = [
  ['cnt_20', 2000, 3],
  ['cnt_10', 1000, 4],
  ['cnt_5', 500, 4],
  ['cnt_2', 200, 5],
  ['cnt_1', 100, 10],
  ['cnt_050', 50, 10],
  ['cnt_020', 20, 10],
  ['cnt_010', 10, 20],
  ['cnt_005', 5, 20],
]
export const FOND_CENTIMES = FOND.reduce((s, [, v, n]) => s + v * n, 0)

function genererCaisse(f: Fenetre, graine: number, tables: Table[]): void {
  const a = creerAlea(graine ^ hacher('caisse'))
  const feuilles = table('public.caisse_sheets', [
    'id',
    'report_date',
    'shift',
    'operator_initials',
    'snt_cash',
    'snt_cb',
    'snt_cvac',
    'snt_cbweb',
    'ls_cash',
    'ls_cb',
    'ls_cvac',
    'caisse_cash',
    'caisse_cb',
    'caisse_cvac',
    'caisse_adyen',
    ...FOND.map(([c]) => c),
    'fund_origin',
    'comment',
    'status',
    'validated_at',
    'validated_by',
    'created_by',
    'created_at',
    'updated_at',
  ])
  const HEURES: Record<string, [number, number]> = {
    matin: [12, 21],
    soir: [21, 23],
    nuit: [2, 11],
  }
  for (let j = f.debut; j <= f.aujourdhui; j++) {
    for (const shift of ['matin', 'soir', 'nuit'] as const) {
      if (j === f.aujourdhui && shift !== 'matin') continue
      const valide = j < f.aujourdhui
      const web = shift !== 'nuit'
      const snt = {
        cash: arrondi2(a.entier(0, 30000) / 100),
        cb: arrondi2(a.entier(30000, 300000) / 100),
        cvac: a.chance(0.2) ? arrondi2(a.entier(2000, 20000) / 100) : 0,
        cbweb: web && a.chance(0.6) ? arrondi2(a.entier(5000, 80000) / 100) : 0,
      }
      const ls = {
        cash: shift === 'nuit' ? 0 : arrondi2(a.entier(0, 8000) / 100),
        cb: shift === 'nuit' ? 0 : arrondi2(a.entier(5000, 60000) / 100),
        cvac: 0,
      }
      // Équilibrée, sauf un petit écart de temps en temps.
      const ecart =
        valide && a.chance(0.05) ? arrondi2(a.entier(-2000, 2000) / 100) : 0
      const caisse = {
        cash: arrondi2(snt.cash + ls.cash + ecart),
        cb: arrondi2(snt.cb + ls.cb),
        cvac: arrondi2(snt.cvac + ls.cvac),
        adyen: snt.cbweb,
      }
      const [h0, h1] = HEURES[shift]
      const jourFin = shift === 'nuit' ? j + 1 : j
      feuilles.lignes.push([
        a.uuid(),
        versIso(j),
        shift,
        a.choix(['AT', 'BT', 'CT', 'DT', 'ET']),
        snt.cash,
        snt.cb,
        snt.cvac,
        snt.cbweb,
        ls.cash,
        ls.cb,
        ls.cvac,
        caisse.cash,
        caisse.cb,
        caisse.cvac,
        caisse.adyen,
        ...FOND.map(([, , n]) => n),
        150,
        ecart !== 0 ? 'Écart constaté, recompté deux fois.' : '',
        valide ? 'validated' : 'draft',
        valide ? horodatage(jourFin, h1, 0) : null,
        valide ? RECEPTION : null,
        RECEPTION,
        horodatage(shift === 'nuit' ? j + 1 : j, h0, 5),
        horodatage(valide ? jourFin : j, valide ? h1 : h0, valide ? 0 : 30),
      ])
    }
  }
  tables.push(feuilles)

  const cautions = table('public.caisse_cautions', [
    'id',
    'room',
    'amount',
    'comment',
    'taken_date',
    'status',
    'refunded_date',
    'refunded_by',
    'refunded_at',
    'created_by',
    'created_at',
    'updated_at',
  ])
  for (let j = f.debut; j <= f.aujourdhui; j++) {
    if (!a.chance(0.35)) continue
    const rembourse = j + a.entier(1, 4)
    const fini = rembourse <= f.aujourdhui && a.chance(0.92)
    cautions.lignes.push([
      a.uuid(),
      a.choix(CHAMBRES),
      a.choix([50, 100, 150, 200]),
      a.choix(['', '', 'Caution en espèces', 'Clé de garage']),
      versIso(j),
      fini ? 'refunded' : 'active',
      fini ? versIso(rembourse) : null,
      fini ? RECEPTION : null,
      fini ? horodatage(rembourse, 11) : null,
      RECEPTION,
      horodatage(j, 16),
      horodatage(fini ? rembourse : j, fini ? 11 : 16),
    ])
  }
  tables.push(cautions)
}

// ---------------------------------------------------------------------------
// Rapprochement des chambres
// ---------------------------------------------------------------------------

function genererRapro(
  f: Fenetre,
  sejours: Sejour[],
  graine: number,
  tables: Table[],
): void {
  const a = creerAlea(graine ^ hacher('rapro'))
  const parChambre = index(sejours)
  const feuilles = table('public.rapro_sheets', [
    'id',
    'report_date',
    'status',
    'comment',
    'validated_at',
    'validated_by',
    'created_by',
    'created_at',
    'updated_at',
    'late_arrivals',
    'corrections',
    'operator_name',
  ])
  const chambres = table('public.rapro_rooms', [
    'id',
    'report_date',
    'room',
    'status',
    'created_by',
    'created_at',
    'updated_at',
    'carried_manual',
    'materialized',
  ])
  const bloquees = new Set<number>()
  for (let j = f.debut; j < f.aujourdhui; j++) {
    const cloture = j < f.aujourdhui - 1
    const hier = new Set(bloquees)
    bloquees.clear()
    for (const ch of CHAMBRES) {
      const vendue = occupant(parChambre.get(ch), j) !== undefined
      let statut: string | null = null
      let materialisee = false
      if (vendue) {
        const r = a.reel()
        if (r < 0.06) statut = 'refus'
        else if (r < 0.09) statut = 'non_nettoyee'
        else if (r < 0.1) statut = 'non_vendue'
        else if (cloture) {
          statut = 'nettoyee'
          materialisee = true
        }
      } else if (hier.has(ch) && a.chance(0.7)) {
        statut = 'rattrapage'
      }
      if (statut === 'non_nettoyee') bloquees.add(ch)
      if (statut === null) continue
      chambres.lignes.push([
        a.uuid(),
        versIso(j),
        ch,
        statut,
        RECEPTION,
        horodatage(j, 14),
        horodatage(materialisee ? j + 1 : j, materialisee ? 10 : 14),
        false,
        materialisee,
      ])
    }
    feuilles.lignes.push([
      a.uuid(),
      versIso(j),
      cloture ? 'validated' : 'draft',
      a.chance(0.1)
        ? 'Deux chambres signalées en retard par la gouvernante.'
        : '',
      cloture ? horodatage(j + 1, 10) : null,
      cloture ? RECEPTION : null,
      RECEPTION,
      horodatage(j, 14),
      horodatage(cloture ? j + 1 : j, cloture ? 10 : 14),
      a.pondere<number>([
        [0, 60],
        [1, 25],
        [2, 10],
        [3, 5],
      ]),
      a.pondere<number>([
        [0, 70],
        [1, 20],
        [2, 10],
      ]),
      a.choix(['Opérateur Test A', 'Opérateur Test B']),
    ])
  }
  tables.push(feuilles, chambres)
}

// ---------------------------------------------------------------------------
// Literie, lits bébé
// ---------------------------------------------------------------------------

function genererLiterie(
  f: Fenetre,
  sejours: Sejour[],
  graine: number,
  tables: Table[],
  apres: string[],
): void {
  const a = creerAlea(graine ^ hacher('literie'))
  const synthetiques = [...CHAMBRES].filter(() => a.chance(0.08)).slice(0, 8)
  if (synthetiques.length > 0) {
    apres.push(
      `update public.hotel_rooms set literie_synthetique = true, updated_at = '${horodatage(f.debut + 2, 10)}', updated_by = '${RECEPTION}' where room in (${synthetiques.join(', ')});`,
    )
  }
  apres.push(
    `update public.literie_stock set synthetic_pillows = 14, synthetic_duvets = 8, updated_at = '${horodatage(f.debut, 9)}' where id = 1;`,
  )
  const mouvements = table('public.literie_stock_movements', [
    'id',
    'room',
    'item',
    'direction',
    'quantity',
    'created_at',
    'created_by',
  ])
  for (const ch of synthetiques) {
    mouvements.lignes.push([
      a.uuid(),
      ch,
      'oreiller',
      'mise_en_place',
      2,
      horodatage(f.debut + 2, 10),
      RECEPTION,
    ])
    mouvements.lignes.push([
      a.uuid(),
      ch,
      'couette',
      'mise_en_place',
      1,
      horodatage(f.debut + 2, 10),
      RECEPTION,
    ])
  }
  tables.push(mouvements)

  const feuilles = table('public.literie_sheets', [
    'id',
    'report_date',
    'comment',
    'status',
    'validated_at',
    'validated_by',
    'created_by',
    'created_at',
    'updated_at',
  ])
  for (let j = f.debut; j <= f.aujourdhui; j++) {
    const valide = j < f.aujourdhui
    feuilles.lignes.push([
      a.uuid(),
      versIso(j),
      '',
      valide ? 'validated' : 'draft',
      valide ? horodatage(j, 18) : null,
      valide ? RECEPTION : null,
      RECEPTION,
      horodatage(j, 11),
      horodatage(j, valide ? 18 : 11),
    ])
  }
  tables.push(feuilles)

  const lits = table('public.baby_cots', [
    'id',
    'label',
    'active',
    'created_at',
  ])
  const affectations = table('public.baby_cot_assignments', [
    'id',
    'cot_id',
    'start_date',
    'end_date',
    'comment',
    'created_by',
    'created_at',
    'updated_at',
    'label',
  ])
  const avecEnfant = sejours.filter((s) => s.enfants > 0)
  for (let n = 1; n <= 4; n++) {
    const id = a.uuid()
    lits.lignes.push([id, `Lit ${n}`, true, horodatage(f.debut - 30, 9)])
    let curseur = f.debut + a.entier(0, 5)
    while (curseur < f.fin - 1) {
      const nuits = Math.min(a.entier(1, 4), f.fin - curseur)
      const sej = avecEnfant.length > 0 ? a.choix(avecEnfant) : undefined
      affectations.lignes.push([
        a.uuid(),
        id,
        versIso(curseur),
        versIso(curseur + nuits), // jour de départ, exclu
        '',
        RECEPTION,
        horodatage(Math.max(f.debut, curseur - 1), 15),
        horodatage(Math.max(f.debut, curseur - 1), 15),
        sej ? `${sej.chambre} · ${sej.client}` : `Client Test ${n}`,
      ])
      curseur += nuits + a.entier(2, 9)
    }
  }
  tables.push(lits, affectations)
}

// ---------------------------------------------------------------------------
// Facturation (légère) et easter eggs
// ---------------------------------------------------------------------------

/** Couples (code analytique, compte) présents dans les référentiels du dépôt. */
const COUPLES_FACTURATION: ReadonlyArray<readonly [string, string]> = [
  ['REPDJFBooo', '60710000'],
  ['REFOODoooo', '60710000'],
  ['REBEALCOOL', '60750000'],
  ['FAABONoooo', '62810000'],
  ['HEFORMoooo', '62230000'],
  ['RAFBOUTooo', '60760000'],
]

const EMETTEURS: ReadonlyArray<
  readonly [string, string, ReadonlyArray<number>]
> = [
  ['fournisseur test alpha', 'Fournisseur Test Alpha', [0, 1]],
  ['boissons exemple', 'Boissons Exemple', [2]],
  ['formation demo', 'Formation Démo', [4]],
  ['boutique fictive', 'Boutique Fictive', [5, 3]],
]

function genererFacturation(f: Fenetre, graine: number, tables: Table[]): void {
  const a = creerAlea(graine ^ hacher('facturation'))
  const emetteurs = table('public.facturation_issuers', [
    'name',
    'display',
    'count',
    'updated_at',
  ])
  const codes = table('public.facturation_issuer_codes', [
    'issuer',
    'code',
    'count',
    'updated_at',
  ])
  const docs = table('public.facturation_learned_docs', [
    'hash',
    'issuer',
    'codes',
    'deltas',
    'method',
    'created_at',
    'comptes',
  ])
  const mots = table('public.facturation_wordpool', [
    'code',
    'token',
    'count',
    'updated_at',
  ])
  const MOTS: Record<string, string[]> = {
    REPDJFBooo: ['croissant', 'viennoiserie', 'jus', 'confiture'],
    REFOODoooo: ['plateau', 'fromage', 'traiteur'],
    REBEALCOOL: ['vin', 'champagne', 'biere'],
    FAABONoooo: ['cotisation', 'adhesion'],
    HEFORMoooo: ['formation', 'stage', 'session'],
    RAFBOUTooo: ['boutique', 'souvenir', 'carte'],
  }
  for (const [cle, affiche, couples] of EMETTEURS) {
    const n = a.entier(2, 6)
    emetteurs.lignes.push([cle, affiche, n, horodatage(f.aujourdhui - 3, 10)])
    for (const i of couples) {
      codes.lignes.push([
        cle,
        COUPLES_FACTURATION[i][0],
        n,
        horodatage(f.aujourdhui - 3, 10),
      ])
    }
    for (let k = 0; k < n; k++) {
      const hash = Array.from({ length: 64 }, () =>
        a.entier(0, 15).toString(16),
      ).join('')
      const choisis = couples.map((i) => COUPLES_FACTURATION[i])
      docs.lignes.push([
        hash,
        cle,
        brut(`array[${choisis.map(([c]) => `'${c}'`).join(', ')}]::text[]`),
        '{}',
        'native',
        horodatage(f.debut + a.entier(0, f.aujourdhui - f.debut), 14),
        JSON.stringify(Object.fromEntries(choisis)),
      ])
    }
  }
  for (const [code, liste] of Object.entries(MOTS)) {
    for (const token of liste)
      mots.lignes.push([
        code,
        token,
        a.entier(1, 9),
        horodatage(f.aujourdhui - 3, 10),
      ])
  }
  tables.push(emetteurs, codes, docs, mots)

  const oeufs = table(
    'public.easter_eggs',
    ['keyword', 'effect_id', 'enabled'],
    'Mots-clés fictifs (ceux du dépôt sont des prénoms) ; effets du registre EFFECTS.',
  )
  oeufs.lignes.push(
    ['bravo', 'fireworks', true],
    ['etoile', 'shootingstars', true],
    ['flocon', 'snow', true],
  )
  tables.push(oeufs)
}

// ---------------------------------------------------------------------------
// Classeurs
// ---------------------------------------------------------------------------

const LOREM =
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(
    ' ',
  )

function phrase(a: Alea, min = 8, max = 16): string {
  const n = a.entier(min, max)
  const mots: string[] = []
  for (let i = 0; i < n; i++) mots.push(a.choix(LOREM))
  const s = mots.join(' ')
  return s.charAt(0).toUpperCase() + s.slice(1) + '.'
}

function paragraphe(a: Alea, n = 3): string {
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(phrase(a))
  return out.join(' ')
}

const ESSAI: ReadonlyArray<{
  label: string
  icon: string
  docs: ReadonlyArray<[string, string, (a: Alea) => string]>
}> = [
  {
    label: 'Titres et texte',
    icon: 'Heading',
    docs: [
      [
        'Niveaux de titre',
        'Les six niveaux et les numéros en pastille',
        (a) =>
          [
            '# 1. Titre de niveau 1',
            paragraphe(a),
            '## 1.1 Titre de niveau 2',
            paragraphe(a, 2),
            '### 1.1.1 Titre de niveau 3',
            paragraphe(a, 2),
            '#### Titre de niveau 4',
            paragraphe(a, 2),
            '##### Titre de niveau 5',
            phrase(a),
            '###### Titre de niveau 6',
            phrase(a),
            '## 2. Deuxième partie',
            paragraphe(a, 4),
          ].join('\n\n'),
      ],
      [
        'Paragraphes et mise en forme',
        'Gras, italique, barré, liens',
        (a) =>
          [
            '## Mise en forme',
            `Un texte en **gras**, un autre en *italique*, un troisième ~~barré~~. ${phrase(a)}`,
            `Un lien vers [la documentation](https://exemple.test/aide). ${phrase(a)}`,
            'Un retour à la ligne simple\ncolle les lignes : il faut une ligne vide pour un nouveau paragraphe.',
            paragraphe(a, 5),
            paragraphe(a, 4),
          ].join('\n\n'),
      ],
      [
        'Saut de page',
        'Une ligne === force une nouvelle page',
        (a) =>
          [
            '## Première page',
            paragraphe(a, 4),
            '===',
            '## Deuxième page',
            paragraphe(a, 4),
            '===',
            '## Troisième page',
            paragraphe(a, 3),
          ].join('\n\n'),
      ],
    ],
  },
  {
    label: 'Listes, encadrés et tableaux',
    icon: 'List',
    docs: [
      [
        'Listes et cases à cocher',
        'Puces, numéros, sous-listes, cases',
        (a) =>
          [
            '## Liste à puces',
            [
              '- ' + phrase(a, 4, 8),
              '- ' + phrase(a, 4, 8),
              '  - ' + phrase(a, 3, 6),
              '  - ' + phrase(a, 3, 6),
              '- ' + phrase(a, 4, 8),
            ].join('\n'),
            '## Liste numérotée',
            [
              '1. ' + phrase(a, 4, 8),
              '2. ' + phrase(a, 4, 8),
              '3. ' + phrase(a, 4, 8),
            ].join('\n'),
            '## Cases à cocher',
            [
              '- [ ] ' + phrase(a, 3, 6),
              '- [ ] ' + phrase(a, 3, 6),
              '- [x] ' + phrase(a, 3, 6),
            ].join('\n'),
          ].join('\n\n'),
      ],
      [
        'Encadrés typés',
        'Attention, Important, Astuce, Note et encadré simple',
        (a) =>
          [
            '## Les cinq encadrés',
            '> [!WARNING]\n> ' + phrase(a),
            '> [!IMPORTANT]\n> ' + phrase(a),
            '> [!TIP]\n> ' + phrase(a),
            '> [!NOTE]\n> ' + phrase(a),
            '> ' + phrase(a),
            paragraphe(a, 2),
          ].join('\n\n'),
      ],
      [
        'Tableaux',
        'Alignements et tableau long coupé entre deux pages',
        (a) => {
          const lignes = [
            '| Élément | Quantité | Prix |',
            '| :--- | :---: | ---: |',
          ]
          for (let i = 1; i <= 30; i++) {
            lignes.push(
              `| ${phrase(a, 2, 4).replace('.', '')} | ${a.entier(1, 20)} | ${a.entier(5, 300)},00 € |`,
            )
          }
          return [
            '## Tableau court',
            '| Colonne A | Colonne B |\n| --- | --- |\n| Un | Deux |\n| Trois | Quatre |',
            '## Tableau long',
            lignes.join('\n'),
          ].join('\n\n')
        },
      ],
    ],
  },
  {
    label: 'Images et blocs',
    icon: 'Image',
    docs: [
      [
        'Images seules',
        'Emplacements à remplir, quatre tailles',
        (a) =>
          [
            '## Taille automatique',
            '![Vue d’ensemble du comptoir, prise de face](a-inserer)',
            '## Petite',
            '![Détail du terminal de paiement](a-inserer "petite")',
            '## Moyenne',
            '![Tableau des clés, porte ouverte](a-inserer "moyenne")',
            '## Grande',
            '![Écran de la caisse, menu principal](a-inserer "grande")',
            '## Pleine largeur',
            '![Capture de l’écran de réservation](a-inserer "pleine")',
            paragraphe(a, 2),
          ].join('\n\n'),
      ],
      [
        'Planche de photos',
        'Grille régulière (:::photos)',
        (a) =>
          [
            '## Repérage avant / après',
            paragraphe(a, 2),
            ':::photos\n![Avant intervention](a-inserer)\n![Après intervention](a-inserer)\n![Vue de détail](a-inserer)\n![Vue d’ensemble](a-inserer)\n:::',
            paragraphe(a, 2),
          ].join('\n\n'),
      ],
      [
        'Étape illustrée',
        'Texte et photo côte à côte (:::etape)',
        (a) =>
          [
            '## 1. Photo à droite',
            ':::etape\n' +
              phrase(a) +
              '\n\n- ' +
              phrase(a, 4, 8) +
              '\n- ' +
              phrase(a, 4, 8) +
              '\n\n![Interrupteur général, capot ouvert](a-inserer "moyenne")\n:::',
            '## 2. Photo à gauche',
            ':::etape{photo=gauche}\n' +
              phrase(a) +
              '\n\n![Vanne d’arrêt, poignée visible](a-inserer "petite")\n:::',
          ].join('\n\n'),
      ],
    ],
  },
  {
    label: 'Code, formules et schémas',
    icon: 'Workflow',
    docs: [
      [
        'Code et formules',
        'Blocs de code et KaTeX',
        (a) =>
          [
            '## Bloc de code',
            '```\nCode de démonstration\nLigne 2\n```',
            '## Formules',
            'En ligne : $TO = \\frac{nuitées}{chambres} \\times 100$.',
            '$$\nRevPAR = \\frac{CA_{hébergement}}{chambres\\ disponibles}\n$$',
            paragraphe(a, 2),
          ].join('\n\n'),
      ],
      [
        'Schéma Mermaid',
        'Organigramme simple',
        () =>
          [
            '## Arrivée d’un client',
            '```mermaid\nflowchart TD\n  A[Client à la réception] --> B{Réservation trouvée ?}\n  B -- Oui --> C[Vérifier l’identité]\n  B -- Non --> D[Proposer une chambre]\n  C --> E[Remettre la clé]\n  D --> E\n```',
          ].join('\n\n'),
      ],
    ],
  },
]

const PROCEDURES: ReadonlyArray<{
  label: string
  icon: string
  titres: ReadonlyArray<string>
}> = [
  {
    label: 'Arrivées et départs',
    icon: 'DoorOpen',
    titres: [
      'Accueil d’un client à l’arrivée',
      'Arrivée d’un groupe',
      'Arrivée tardive après minuit',
      'Départ et facturation',
      'Départ anticipé',
    ],
  },
  {
    label: 'Caisse et paiements',
    icon: 'Wallet',
    titres: [
      'Ouverture de la caisse',
      'Clôture d’un shift',
      'Prise d’une caution',
      'Remboursement d’une caution',
      'Encaissement d’une facture société',
    ],
  },
  {
    label: 'Petit-déjeuner',
    icon: 'Coffee',
    titres: [
      'Mise en place du buffet',
      'Pointage des petits-déjeuners',
      'Petit-déjeuner offert',
      'Client absent de la liste',
      'Clôture du service',
    ],
  },
  {
    label: 'Parking',
    icon: 'Car',
    titres: [
      'Réservation d’une place',
      'Arrivée au parking',
      'Place occupée par erreur',
      'Facturation du parking',
      'Badge perdu',
    ],
  },
  {
    label: 'Sécurité',
    icon: 'ShieldAlert',
    titres: [
      'Déclenchement de l’alarme incendie',
      'Coupure d’électricité',
      'Fuite d’eau dans une chambre',
      'Client souffrant',
      'Ascenseur bloqué',
    ],
  },
  {
    label: 'Chambres et ménage',
    icon: 'BedDouble',
    titres: [
      'Rapprochement des chambres',
      'Chambre refusée au ménage',
      'Installation d’un lit bébé',
      'Literie synthétique',
      'Objet trouvé',
    ],
  },
]

const VERBES = [
  'Vérifier',
  'Saisir',
  'Contrôler',
  'Prévenir',
  'Noter',
  'Remettre',
  'Ouvrir',
  'Fermer',
  'Imprimer',
  'Ranger',
]

function procedure(a: Alea, titre: string): string {
  const etape = (): string =>
    `${a.choix(VERBES)} ${phrase(a, 4, 9).toLowerCase()}`
  const blocs: string[] = [
    `${phrase(a)} ${phrase(a)}`,
    '## 1. Préparer',
    [etape(), etape(), etape()].map((e) => `- ${e}`).join('\n'),
  ]
  const sections = a.entier(2, 5)
  for (let i = 2; i <= sections + 1; i++) {
    blocs.push(
      `## ${i}. ${a.choix(['Réaliser', 'Contrôler', 'Informer le client', 'Enregistrer', 'Suivre'])}`,
    )
    const n = a.entier(3, 6)
    blocs.push(
      Array.from({ length: n }, (_, k) => `${k + 1}. ${etape()}`).join('\n'),
    )
    if (a.chance(0.35))
      blocs.push(
        `> [!${a.choix(['IMPORTANT', 'TIP', 'NOTE'])}]\n> ${phrase(a)}`,
      )
    if (a.chance(0.3))
      blocs.push(`![${titre} : étape ${i}, vue de face](a-inserer)`)
    if (a.chance(0.25)) {
      const lignes = ['| Contrôle | Fréquence |', '| --- | --- |']
      for (let k = 0; k < a.entier(2, 5); k++)
        lignes.push(
          `| ${phrase(a, 2, 4).replace('.', '')} | ${a.choix(['Chaque shift', 'Chaque jour', 'Chaque semaine'])} |`,
        )
      blocs.push(lignes.join('\n'))
    }
    if (a.chance(0.4)) blocs.push(paragraphe(a, a.entier(2, 5)))
  }
  if (a.chance(0.3)) blocs.push(`> [!WARNING]\n> ${phrase(a)}`)
  if (a.chance(0.2)) blocs.push('===', '## Annexe', paragraphe(a, 6))
  blocs.push(
    '## Avant de terminer',
    ['- [ ] ' + etape(), '- [ ] ' + etape()].join('\n'),
  )
  return blocs.join('\n\n')
}

function genererClasseurs(
  f: Fenetre,
  graine: number,
  tables: Table[],
  apres: string[],
): void {
  const a = creerAlea(graine ^ hacher('classeurs'))
  const classeurs = table('public.classeur_classeurs', [
    'id',
    'uuid',
    'name',
    'icon',
    'etablissement',
    'etablissement_complement',
    'sort_order',
    'created_at',
    'updated_at',
    'created_by',
    'acces_tous',
  ])
  const chapitres = table('public.classeur_chapters', [
    'id',
    'uuid',
    'classeur_id',
    'label',
    'icon',
    'description',
    'sort_order',
    'created_at',
    'updated_at',
    'created_by',
  ])
  const documents = table('public.classeur_documents', [
    'id',
    'uuid',
    'chapter_id',
    'title',
    'description',
    'content',
    'sort_order',
    'created_at',
    'updated_at',
    'created_by',
    'version_majeure',
    'version_mineure',
    'version_raison',
  ])
  const versions = table('public.classeur_document_versions', [
    'document_id',
    'classeur_id',
    'title',
    'description',
    'content',
    'origine',
    'auteur',
    'created_by',
    'created_at',
    'version',
    'raison',
  ])
  const suivis = table('public.classeur_tracking_sheets', [
    'id',
    'uuid',
    'chapter_id',
    'title',
    'periodicite_id',
    'sort_order',
    'created_at',
    'updated_at',
    'created_by',
  ])
  const signatures = table('public.classeur_signature_sheets', [
    'id',
    'uuid',
    'chapter_id',
    'title',
    'description',
    'nombre',
    'sort_order',
    'created_at',
    'updated_at',
    'created_by',
  ])
  const intercalaires = table('public.classeur_intercalaires', [
    'id',
    'uuid',
    'chapter_id',
    'title',
    'description',
    'sort_order',
    'created_at',
    'updated_at',
    'created_by',
  ])
  const acces = table('public.classeur_acces', [
    'classeur_id',
    'user_id',
    'niveau',
    'created_at',
    'updated_at',
    'created_by',
  ])
  for (const t of [
    classeurs,
    chapitres,
    documents,
    suivis,
    signatures,
    intercalaires,
  ])
    t.identiteForcee = true

  let idChapitre = 0
  let idDocument = 0
  let idSuivi = 0
  let idSignature = 0
  let idIntercalaire = 0
  const cree = horodatage(f.debut - 20, 10)

  const ajouterClasseur = (
    id: number,
    nom: string,
    icone: string,
    accesTous: string,
  ): void => {
    classeurs.lignes.push([
      id,
      a.uuid(),
      nom,
      icone,
      'Hôtel de démonstration',
      'Données fictives',
      id,
      cree,
      cree,
      ADMIN,
      accesTous,
    ])
  }
  const ajouterChapitre = (
    classeur: number,
    label: string,
    icone: string,
    ordre: number,
  ): number => {
    idChapitre++
    chapitres.lignes.push([
      idChapitre,
      a.uuid(),
      classeur,
      label,
      icone,
      '',
      ordre,
      cree,
      cree,
      ADMIN,
    ])
    return idChapitre
  }
  const ajouterDocument = (
    classeur: number,
    chapitre: number,
    titre: string,
    description: string,
    contenu: string,
    ordre: number,
  ): void => {
    idDocument++
    const jour = f.debut - 20 + a.entier(0, 80)
    const quand = horodatage(
      Math.min(jour, f.aujourdhui),
      10 + a.entier(0, 7),
      a.entier(0, 59),
    )
    // Un document sur cinq a été retouché une fois : l'historique a deux versions.
    const retouche = a.chance(0.2)
    documents.lignes.push([
      idDocument,
      a.uuid(),
      chapitre,
      titre,
      description,
      contenu,
      ordre,
      cree,
      quand,
      ADMIN,
      1,
      retouche ? 1 : 0,
      retouche ? 'contenu modifié' : '',
    ])
    if (retouche) {
      const ancien = contenu.split('\n\n').slice(0, -1).join('\n\n')
      versions.lignes.push([
        idDocument,
        classeur,
        titre,
        description,
        ancien,
        'creation',
        'Admin Test',
        ADMIN,
        cree,
        '1.0',
        '',
      ])
      versions.lignes.push([
        idDocument,
        classeur,
        titre,
        description,
        contenu,
        'enregistrement',
        'Admin Test',
        ADMIN,
        quand,
        '1.1',
        'contenu modifié',
      ])
    } else {
      versions.lignes.push([
        idDocument,
        classeur,
        titre,
        description,
        contenu,
        'creation',
        'Admin Test',
        ADMIN,
        cree,
        '1.0',
        '',
      ])
    }
  }
  const periodicite = (label: string): Brut =>
    brut(
      `(select id from public.classeur_periodicites where label = '${label}')`,
    )

  // 1. Classeur d'essai (vitrine des fonctions d'un document).
  ajouterClasseur(
    1,
    'Essai mise en page (lorem ipsum)',
    'FlaskConical',
    'lecture',
  )
  ESSAI.forEach((ch, i) => {
    const idc = ajouterChapitre(1, ch.label, ch.icon, i + 1)
    ch.docs.forEach(([titre, desc, corps], k) =>
      ajouterDocument(1, idc, titre, desc, corps(a), k + 1),
    )
  })
  {
    const idc = ajouterChapitre(
      1,
      'Feuilles de suivi',
      'ClipboardList',
      ESSAI.length + 1,
    )
    idIntercalaire++
    intercalaires.lignes.push([
      idIntercalaire,
      a.uuid(),
      idc,
      'Registres',
      'Feuilles à remplir à la main',
      1,
      cree,
      cree,
      ADMIN,
    ])
    idSuivi++
    suivis.lignes.push([
      idSuivi,
      a.uuid(),
      idc,
      'Contrôle mensuel (exemple)',
      periodicite('Mensuel'),
      2,
      cree,
      cree,
      ADMIN,
    ])
    idSignature++
    signatures.lignes.push([
      idSignature,
      a.uuid(),
      idc,
      'Émargement (exemple)',
      'Lu et approuvé',
      14,
      3,
      cree,
      cree,
      ADMIN,
    ])
  }

  // 2. Procédures fictives : 6 chapitres de 5 documents.
  ajouterClasseur(
    2,
    'Procédures de la réception (fictif)',
    'ConciergeBell',
    'lecture',
  )
  PROCEDURES.forEach((ch, i) => {
    const idc = ajouterChapitre(2, ch.label, ch.icon, i + 1)
    ch.titres.forEach((titre, k) =>
      ajouterDocument(
        2,
        idc,
        titre,
        `Procédure ${ch.label.toLowerCase()}`,
        procedure(a, titre),
        k + 1,
      ),
    )
  })

  // 3. Registre privé (accès « aucun » pour tous, exception pour un compte).
  ajouterClasseur(3, 'Registre de sécurité (fictif)', 'Shield', 'aucun')
  {
    const idc = ajouterChapitre(
      3,
      'Vérifications périodiques',
      'CalendarCheck',
      1,
    )
    const SUIVIS: ReadonlyArray<[string, string]> = [
      ['Extincteurs', 'Annuel'],
      ['Alarme incendie', 'Semestriel'],
      ['Éclairage de sécurité', 'Mensuel'],
      ['Installation électrique', 'Annuel'],
      ['Ascenseur', 'Quinquennal'],
    ]
    SUIVIS.forEach(([titre, per], k) => {
      idSuivi++
      suivis.lignes.push([
        idSuivi,
        a.uuid(),
        idc,
        titre,
        periodicite(per),
        k + 1,
        cree,
        cree,
        ADMIN,
      ])
    })
    const idc2 = ajouterChapitre(3, 'Formations', 'GraduationCap', 2)
    ajouterDocument(
      3,
      idc2,
      'Consignes générales',
      'À lire avant toute formation',
      procedure(a, 'Consignes générales'),
      1,
    )
    idSignature++
    signatures.lignes.push([
      idSignature,
      a.uuid(),
      idc2,
      'Formation évacuation',
      'Émargement des participants',
      20,
      2,
      cree,
      cree,
      ADMIN,
    ])
  }
  acces.lignes.push([3, COMPTES[3].id, 'lecture', cree, cree, ADMIN])

  tables.push(
    classeurs,
    chapitres,
    documents,
    versions,
    suivis,
    signatures,
    intercalaires,
    acces,
  )
  for (const t of [
    'classeur_classeurs',
    'classeur_chapters',
    'classeur_documents',
    'classeur_tracking_sheets',
    'classeur_signature_sheets',
    'classeur_intercalaires',
  ]) {
    apres.push(
      `select setval(pg_get_serial_sequence('public.${t}', 'id'), (select max(id) from public.${t}));`,
    )
  }
}

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

export interface Options {
  /** Date du jour, 'YYYY-MM-DD'. */
  aujourdhui: string
  graine?: number
}

export function fenetreDe(aujourdhui: string): Fenetre {
  const j = versJour(aujourdhui)
  return { debut: j - JOURS_AVANT, fin: j + JOURS_APRES, aujourdhui: j }
}

export function genererDonnees(opts: Options): Donnees {
  const graine = (opts.graine ?? GRAINE_PAR_DEFAUT) >>> 0
  const f = fenetreDe(opts.aujourdhui)
  const tables: Table[] = []
  const apres: string[] = []
  genererComptes(f, tables)
  const sejours = genererSejours(f, graine)
  genererRepjour(f, sejours, graine, tables)
  genererPdj(f, sejours, graine, tables)
  genererParking(f, sejours, graine, tables)
  genererCaisse(f, graine, tables)
  genererRapro(f, sejours, graine, tables)
  genererLiterie(f, sejours, graine, tables, apres)
  genererFacturation(f, graine, tables)
  genererClasseurs(f, graine, tables, apres)
  return { graine, fenetre: f, tables, apres }
}

export function litteral(v: Val): string {
  if (v === null) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`Nombre invalide : ${v}`)
    return String(v)
  }
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
  return v.brut
}

const PAQUET = 500

function insertion(t: Table): string {
  if (t.lignes.length === 0) return `-- ${t.nom} : aucune ligne\n`
  const morceaux: string[] = []
  if (t.note) morceaux.push(`-- ${t.note}`)
  for (let i = 0; i < t.lignes.length; i += PAQUET) {
    const paquet = t.lignes.slice(i, i + PAQUET)
    const valeurs = paquet.map((l) => {
      if (l.length !== t.colonnes.length)
        throw new Error(
          `${t.nom} : ligne de ${l.length} valeurs pour ${t.colonnes.length} colonnes`,
        )
      return `  (${l.map(litteral).join(', ')})`
    })
    morceaux.push(
      `insert into ${t.nom} (${t.colonnes.join(', ')})${t.identiteForcee ? ' overriding system value' : ''}\nvalues\n${valeurs.join(',\n')};`,
    )
  }
  return morceaux.join('\n') + '\n'
}

/** Contrôle des clés étrangères, joué APRÈS le retour au mode `origin` :
 * en mode `replica`, Postgres ne les vérifie pas (elles passent par des
 * triggers internes). Toute ligne orpheline fait échouer le seed. */
const CONTROLE_FK = `do $controle$
declare
  r record;
  n bigint;
begin
  for r in
    select c.conname, c.conrelid::regclass as t, a.attname as col,
           c.confrelid::regclass as rt, ra.attname as rcol
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = c.confkey[1]
     where c.contype = 'f'
       and c.connamespace = 'public'::regnamespace
       and array_length(c.conkey, 1) = 1
  loop
    execute format(
      'select count(*) from %s x where x.%I is not null and not exists (select 1 from %s y where y.%I = x.%I)',
      r.t, r.col, r.rt, r.rcol, r.col) into n;
    if n > 0 then
      raise exception 'seed : % lignes orphelines pour %', n, r.conname;
    end if;
  end loop;
end
$controle$;`

export function versSql(d: Donnees, referentiels: string): string {
  const f = d.fenetre
  const entete = `-- =====================================================================
-- seed.sql — DONNÉES FICTIVES de la base LOCALE. FICHIER GÉNÉRÉ : ne pas
-- éditer à la main, régénérer par :
--   npx tsx supabase/seed/generer.ts --date=${versIso(f.aujourdhui)} --graine=${d.graine}
-- (plan environnement-dev-docker-2026-10-12, étape 5).
--
-- Rejoué par \`supabase db reset\` après les migrations. JAMAIS en prod :
-- \`db push\` ne joue pas seed.sql. Tout est inventé : aucun vrai nom,
-- toutes les adresses en @${DOMAINE}.
--
-- Fenêtre : ${versIso(f.debut)} → ${versIso(f.fin)} (90 jours, J = ${versIso(f.aujourdhui)}).
--
-- Comptes de test (LOCAL SEULEMENT), mot de passe commun : ${MOT_DE_PASSE}
${COMPTES.map((c) => `--   ${c.email.padEnd(26)} ${c.role === 'admin' ? 'admin' : c.droits.length === 0 ? 'aucune page' : c.cle}`).join('\n')}
--
-- session_replication_role = replica : le seed tourne en \`postgres\` ; les
-- triggers d'estampillage (keep_author, classeur_stamp, caisse_stamp…)
-- remplaceraient les auteurs et dates fabriqués par auth.uid() (NULL ici) et
-- now(), et les gardes (classeur_garde, rapro_jour_cloture_fige…) n'ont pas
-- de sens pour un chargement initial. Le mode replica coupe les triggers
-- utilisateur ET la vérification des clés étrangères : celle-ci est donc
-- refaite à la fin (bloc « controle »). Les CHECK, UNIQUE et la contrainte
-- d'exclusion du parking restent actifs. Conséquences assumées : aucune ligne
-- d'audit_log, les versions de documents sont écrites ici, pas par trigger.
-- =====================================================================
`
  const corps: string[] = [
    entete,
    'set session_replication_role = replica;\n',
    '-- ---- Référentiels repris des scripts versionnés de supabase/ ----',
    referentiels,
    '',
  ]
  for (const t of d.tables)
    corps.push(`-- ---- ${t.nom} (${t.lignes.length}) ----\n${insertion(t)}`)
  corps.push(
    '-- ---- Mises à jour de référentiels et séquences ----',
    ...d.apres,
    '',
  )
  corps.push('set session_replication_role = origin;\n', CONTROLE_FK, '')
  return corps.join('\n')
}

export function genererSeed(opts: Options, referentiels: string): string {
  return versSql(genererDonnees(opts), referentiels)
}

// ---------------------------------------------------------------------------
// Référentiels versionnés (lecture du dépôt, hors du cœur pur)
// ---------------------------------------------------------------------------

/** Extrait l'instruction SQL qui commence à `debut` (insensible à la casse),
 * jusqu'au `;` hors chaîne et hors commentaire. */
export function extraireInstruction(
  texte: string,
  debut: string,
  depuis = 0,
): { sql: string; fin: number } | null {
  const i = texte.toLowerCase().indexOf(debut.toLowerCase(), depuis)
  if (i === -1) return null
  let dansChaine = false
  for (let k = i; k < texte.length; k++) {
    const c = texte[k]
    if (dansChaine) {
      if (c === "'") dansChaine = false
      continue
    }
    if (c === "'") dansChaine = true
    else if (c === '-' && texte[k + 1] === '-') {
      const nl = texte.indexOf('\n', k)
      k = nl === -1 ? texte.length : nl
    } else if (c === ';') return { sql: texte.slice(i, k + 1), fin: k + 1 }
  }
  throw new Error(`Instruction non terminée : ${debut}`)
}

function toutesLesInstructions(texte: string, debut: string): string[] {
  const out: string[] = []
  let pos = 0
  for (;;) {
    const r = extraireInstruction(texte, debut, pos)
    if (!r) return out
    out.push(r.sql)
    pos = r.fin
  }
}

/** SQL des référentiels, repris des scripts versionnés (source de vérité). */
export function lireReferentiels(racineSupabase: string): string {
  const lire = (f: string): string =>
    readFileSync(join(racineSupabase, f), 'utf8')
  const une = (fichier: string, debut: string): string => {
    const r = extraireInstruction(lire(fichier), debut)
    if (!r) throw new Error(`${fichier} : « ${debut} » introuvable`)
    return `-- source : supabase/${fichier}\n${r.sql}`
  }
  const morceaux = [
    une('classeur_2026-09-25.sql', 'insert into public.classeur_periodicites'),
    une('literie.sql', 'insert into public.hotel_rooms (room)'),
    une('literie.sql', 'insert into public.literie_stock (id)'),
    une('affiche_templates.sql', 'insert into public.affiche_templates'),
    une(
      'facturation_budget_lines.sql',
      'insert into public.facturation_budget_lines',
    ),
    `-- source : supabase/facturation_budget_lines_descriptions.sql\n${toutesLesInstructions(lire('facturation_budget_lines_descriptions.sql'), 'update public.facturation_budget_lines set hint').join('\n')}`,
    une(
      'facturation_ref_comptes_seed.sql',
      'insert into public.facturation_ref_comptes',
    ),
    une(
      'facturation_ref_imputations_seed.sql',
      'insert into public.facturation_ref_imputations',
    ),
  ]
  // Un nom de personne dans un indice de recherche : retiré (aucun vrai nom).
  return morceaux
    .join('\n\n')
    .replace(/Droits photos J\.Galland/g, 'Droits photos')
}

// ---------------------------------------------------------------------------
// Ligne de commande
// ---------------------------------------------------------------------------

function dateDeParis(): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function principal(argv: string[]): void {
  const arg = (nom: string): string | undefined =>
    argv.find((x) => x.startsWith(`--${nom}=`))?.split('=')[1]
  const ici = dirname(fileURLToPath(import.meta.url))
  const racine = resolve(ici, '..')
  const aujourdhui = arg('date') ?? dateDeParis()
  const graine = arg('graine') ? Number(arg('graine')) : GRAINE_PAR_DEFAUT
  const sortie = arg('sortie') ?? join(racine, 'seed.sql')
  const sql = genererSeed({ aujourdhui, graine }, lireReferentiels(racine))
  writeFileSync(sortie, sql, 'utf8')
  console.log(
    `seed écrit : ${sortie} (${Math.round(sql.length / 1024)} ko, J = ${aujourdhui}, graine ${graine})`,
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  principal(process.argv.slice(2))
}

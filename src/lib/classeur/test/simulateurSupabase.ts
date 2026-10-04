/*
 * Faux client Supabase EN MÉMOIRE pour les tests du Classeur (étape 0 du
 * plan `classeur-fonctions-2026-10-04`). La base de production n'est jamais
 * touchée : les tables sont des tableaux, le stockage une Map par bucket.
 *
 * Ce qu'il reproduit de PostgREST et de nos triggers, parce que le code du
 * service en dépend :
 * - les filtres (`eq`, `neq`, `in`, `is`, `gt`, `gte`, `lt`, `lte`,
 *   `filter`), `order`, `limit`, `single`, `maybeSingle` ;
 * - un `select` ne filtre JAMAIS `deleted_at` tout seul (la suppression
 *   douce est l'affaire de l'appelant) ;
 * - `classeur_stamp` : `updated_at` posé à chaque écriture, SAUF s'il est
 *   fourni et différent de l'ancien (fusion, restauration) ;
 * - `classeur_versions_suivent` : l'historique suit un document ou un
 *   chapitre déplacé de classeur ;
 * - un refus RLS par (table, opération) : `select`/`update`/`delete` rendent
 *   0 ligne SANS erreur (comme la vraie RLS), `insert` rend 42501 ;
 * - une panne injectable au N-ième appel (base ou stockage) : `error`
 *   PostgREST, aucun effet.
 */

export type Ligne = Record<string, unknown>
export type Operation = 'select' | 'insert' | 'upsert' | 'update' | 'delete'

export interface ErreurPostgrest {
  message: string
  code: string
  details: string | null
  hint: string | null
}

export interface Reponse<T = unknown> {
  data: T | null
  error: ErreurPostgrest | null
}

/** Tables qui portent le trigger `classeur_stamp`. */
const TABLES_ESTAMPILLEES = new Set([
  'classeur_classeurs',
  'classeur_chapters',
  'classeur_documents',
  'classeur_tracking_sheets',
  'classeur_signature_sheets',
  'classeur_intercalaires',
  'classeur_merge_history',
  'classeur_images',
  'classeur_acces',
])

type Filtre = (l: Ligne) => boolean

const OPERATEURS: Record<string, (a: unknown, b: unknown) => boolean> = {
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
  is: (a, b) => (a ?? null) === b,
  in: (a, b) => (b as ReadonlyArray<unknown>).includes(a),
  gt: (a, b) => (a as number) > (b as number),
  gte: (a, b) => (a as number) >= (b as number),
  lt: (a, b) => (a as number) < (b as number),
  lte: (a, b) => (a as number) <= (b as number),
}

function projeter(l: Ligne, colonnes: string | undefined): Ligne {
  if (colonnes === undefined || colonnes.trim() === '*') return { ...l }
  const r: Ligne = {}
  for (const c of colonnes
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)) {
    r[c] = l[c] ?? null
  }
  return r
}

export class SimulateurSupabase {
  tables: Record<string, Ligne[]> = {}
  stockage: Record<string, Map<string, unknown>> = {}
  /** Appels attendus (base et stockage), dans l'ordre. */
  journal: Array<{ cible: string; operation: string }> = []
  private refus = new Set<string>()
  private panne: { au: number; erreur: ErreurPostgrest } | null = null
  private prochainId = 1000
  private tic = 0

  constructor(tables: Record<string, Ligne[]> = {}) {
    for (const [t, lignes] of Object.entries(tables)) {
      this.tables[t] = lignes.map((l) => ({ ...l }))
    }
  }

  /** Horloge strictement croissante, une seconde par écriture. */
  maintenant(): string {
    this.tic += 1
    return new Date(Date.UTC(2026, 9, 1) + this.tic * 1000).toISOString()
  }

  refuser(table: string, operation: Operation): void {
    this.refus.add(`${table}:${operation}`)
  }

  /** Le N-ième appel (1 = le premier, compté depuis le début) échoue. */
  panneAuAppel(n: number, code = '08006', message = 'Panne simulée'): void {
    this.panne = { au: n, erreur: { message, code, details: null, hint: null } }
  }

  table(nom: string): Ligne[] {
    return (this.tables[nom] ??= [])
  }

  private enregistrer(
    cible: string,
    operation: string,
  ): ErreurPostgrest | null {
    this.journal.push({ cible, operation })
    return this.panne?.au === this.journal.length ? this.panne.erreur : null
  }

  private refuse(table: string, operation: Operation): boolean {
    return this.refus.has(`${table}:${operation}`)
  }

  private inserer(table: string, l: Ligne): Ligne {
    const ligne: Ligne = { deleted_at: null, ...l }
    if (ligne.id === undefined) ligne.id = ++this.prochainId
    if (TABLES_ESTAMPILLEES.has(table) && ligne.updated_at == null) {
      ligne.updated_at = this.maintenant()
    }
    this.table(table).push(ligne)
    return ligne
  }

  private modifier(table: string, l: Ligne, patch: Ligne): void {
    const avant = { ...l }
    Object.assign(l, patch)
    if (TABLES_ESTAMPILLEES.has(table) && l.updated_at === avant.updated_at) {
      l.updated_at = this.maintenant()
    }
    this.versionsSuivent(table, avant, l)
  }

  /** Miroir de `private.classeur_versions_suivent`. */
  private versionsSuivent(table: string, avant: Ligne, apres: Ligne): void {
    const versions = this.table('classeur_document_versions')
    const chapitres = this.table('classeur_chapters')
    if (
      table === 'classeur_documents' &&
      apres.chapter_id !== avant.chapter_id
    ) {
      const ch = chapitres.find((c) => c.id === apres.chapter_id)
      for (const v of versions) {
        if (ch && v.document_id === apres.id) v.classeur_id = ch.classeur_id
      }
    } else if (
      table === 'classeur_chapters' &&
      apres.classeur_id !== avant.classeur_id
    ) {
      const docs = this.table('classeur_documents')
        .filter((d) => d.chapter_id === apres.id)
        .map((d) => d.id)
      for (const v of versions) {
        if (docs.includes(v.document_id)) v.classeur_id = apres.classeur_id
      }
    }
  }

  /** Le client à injecter à la place de `supabase` (`vi.mock`). */
  readonly client = {
    from: (table: string) => new Requete(this, table),
    storage: {
      from: (bucket: string) => this.bucket(bucket),
    },
  }

  private bucket(nom: string) {
    const objets = (this.stockage[nom] ??= new Map())
    const appel = (operation: string) =>
      this.enregistrer(`storage:${nom}`, operation)
    return {
      upload: async (chemin: string, contenu: unknown) => {
        const error = appel('upload')
        if (error) return { data: null, error }
        objets.set(chemin, contenu)
        return { data: { path: chemin }, error: null }
      },
      copy: async (de: string, vers: string) => {
        const error = appel('copy')
        if (error) return { data: null, error }
        if (!objets.has(de)) {
          return {
            data: null,
            error: {
              message: 'Object not found',
              code: '404',
              details: null,
              hint: null,
            },
          }
        }
        objets.set(vers, objets.get(de))
        return { data: { path: vers }, error: null }
      },
      remove: async (chemins: ReadonlyArray<string>) => {
        const error = appel('remove')
        if (error) return { data: null, error }
        const retires = chemins.filter((c) => objets.delete(c))
        return { data: retires.map((name) => ({ name })), error: null }
      },
    }
  }

  /** Exécution d'une requête construite (appelé par `Requete`). */
  executer(r: Requete): Reponse {
    const erreur = this.enregistrer(r.table, r.operation)
    if (erreur) return { data: null, error: erreur }
    const refus = this.refuse(r.table, r.operation)
    const lignes = this.table(r.table)
    let touchees: Ligne[]
    if (r.operation === 'insert' || r.operation === 'upsert') {
      if (refus) {
        return {
          data: null,
          error: {
            message: 'new row violates row-level security policy',
            code: '42501',
            details: null,
            hint: null,
          },
        }
      }
      touchees = r.valeurs.map((v) => {
        const existante =
          r.operation === 'upsert'
            ? lignes.find((l) => l.id === v.id)
            : undefined
        if (existante) {
          this.modifier(r.table, existante, v)
          return existante
        }
        return this.inserer(r.table, v)
      })
    } else {
      touchees = refus ? [] : lignes.filter((l) => r.filtres.every((f) => f(l)))
      if (r.operation === 'update') {
        for (const l of touchees) this.modifier(r.table, l, r.valeurs[0])
      } else if (r.operation === 'delete') {
        this.tables[r.table] = lignes.filter((l) => !touchees.includes(l))
      }
    }
    if (r.operation !== 'select' && r.colonnes === undefined) {
      return { data: null, error: null }
    }
    let data = [...touchees]
    for (const [col, asc] of [...r.tris].reverse()) {
      data.sort((a, b) => {
        const x = a[col] as number
        const y = b[col] as number
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1)
      })
    }
    if (r.limite !== null) data = data.slice(0, r.limite)
    const projete = data.map((l) => projeter(l, r.colonnes))
    if (r.unique === null) return { data: projete, error: null }
    if (projete.length > 1 || (projete.length === 0 && r.unique === 'single')) {
      return {
        data: null,
        error: {
          message: 'JSON object requested, multiple (or no) rows returned',
          code: 'PGRST116',
          details: null,
          hint: null,
        },
      }
    }
    return { data: projete[0] ?? null, error: null }
  }
}

/** Constructeur de requête : chaînable et « thenable » comme postgrest-js. */
export class Requete implements PromiseLike<Reponse<any>> {
  operation: Operation = 'select'
  colonnes: string | undefined
  valeurs: Ligne[] = []
  filtres: Filtre[] = []
  tris: Array<[string, boolean]> = []
  limite: number | null = null
  unique: 'single' | 'maybe' | null = null

  constructor(
    private sim: SimulateurSupabase,
    readonly table: string,
  ) {}

  select(colonnes = '*'): this {
    this.colonnes = colonnes
    return this
  }
  insert(v: Ligne | Ligne[]): this {
    this.operation = 'insert'
    this.valeurs = Array.isArray(v) ? v : [v]
    return this
  }
  upsert(v: Ligne | Ligne[]): this {
    this.operation = 'upsert'
    this.valeurs = Array.isArray(v) ? v : [v]
    return this
  }
  update(patch: Ligne): this {
    this.operation = 'update'
    this.valeurs = [patch]
    return this
  }
  delete(): this {
    this.operation = 'delete'
    return this
  }
  filter(col: string, op: string, val: unknown): this {
    const f = OPERATEURS[op] as (typeof OPERATEURS)[string] | undefined
    if (f === undefined) throw new Error(`Opérateur non simulé : ${op}`)
    this.filtres.push((l) => f(l[col], val))
    return this
  }
  eq(col: string, val: unknown): this {
    return this.filter(col, 'eq', val)
  }
  neq(col: string, val: unknown): this {
    return this.filter(col, 'neq', val)
  }
  is(col: string, val: unknown): this {
    return this.filter(col, 'is', val)
  }
  in(col: string, val: ReadonlyArray<unknown>): this {
    return this.filter(col, 'in', val)
  }
  gt(col: string, val: unknown): this {
    return this.filter(col, 'gt', val)
  }
  gte(col: string, val: unknown): this {
    return this.filter(col, 'gte', val)
  }
  lt(col: string, val: unknown): this {
    return this.filter(col, 'lt', val)
  }
  lte(col: string, val: unknown): this {
    return this.filter(col, 'lte', val)
  }
  order(col: string, opts: { ascending?: boolean } = {}): this {
    this.tris.push([col, opts.ascending ?? true])
    return this
  }
  limit(n: number): this {
    this.limite = n
    return this
  }
  single(): this {
    this.unique = 'single'
    return this
  }
  maybeSingle(): this {
    this.unique = 'maybe'
    return this
  }

  then<TOk = Reponse<any>, TKo = never>(
    ok?: ((r: Reponse<any>) => TOk | PromiseLike<TOk>) | null,
    ko?: ((e: unknown) => TKo | PromiseLike<TKo>) | null,
  ): PromiseLike<TOk | TKo> {
    return Promise.resolve()
      .then(() => this.sim.executer(this))
      .then(ok, ko)
  }
}

// Faux client service_role pour les tests de `create-user` et `delete-user`.
// AUCUN réseau : un état en mémoire (jetons, profils, identités) et un journal
// ordonné des opérations, pour vérifier l'ORDRE autant que le résultat.
//
// Sémantique reproduite de supabase-js (2.x), parce que c'est elle que le code
// testé doit encaisser :
//   - rien ne LÈVE : toute erreur revient dans `{ data, error }` ;
//   - `.single()` sur 0 ligne → `error` PGRST116, `data: null` ;
//   - `.maybeSingle()` sur 0 ligne → `data: null`, `error: null` ;
//   - `auth.getUser(jwt)` invalide → `data.user: null` + `error`.
//
// Chaque erreur simulée porte un DÉTAIL INTERNE (`DETAIL_INTERNE`) : un test
// peut ainsi prouver qu'il ne remonte jamais jusqu'au client HTTP.

export const DETAIL_INTERNE = 'detail-interne-pg: relation auth.users fk_xyz'

export type Erreur = { message: string; code?: string; status?: number }

export type Operation =
  | 'getUser'
  | 'lireProfil'
  | 'supprimerProfil'
  | 'getUserById'
  | 'createUser'
  | 'updateUserById'
  | 'deleteUser'

export type Identite = {
  id: string
  email: string
  created_at: string
  banned_until?: string
}

export type EtatFaux = {
  /** jeton → id de l'identité qu'il authentifie */
  jetons: Record<string, string>
  profils: Map<string, { id: string; role: string }>
  identites: Map<string, Identite>
  /** Pannes forcées par opération (rendues en `{ error }`, jamais levées). */
  pannes: Partial<Record<Operation, Erreur>>
  /** Panne seulement pour un `updateUserById` levant le ban (`'none'`). */
  panneLeveeBan?: Erreur
}

export function erreur(code?: string): Erreur {
  return { message: DETAIL_INTERNE, code, status: 500 }
}

export function fauxClientAdmin(etat: EtatFaux) {
  const journal: string[] = []
  const appels: { url: string; cle: string }[] = []
  let idSuivant = 1

  const client = {
    from(table: string) {
      return {
        select(colonnes: string) {
          return {
            eq(col: string, val: string) {
              const lire = (mode: 'single' | 'maybeSingle') => {
                journal.push(`lireProfil(${val})`)
                const panne = etat.pannes.lireProfil
                if (panne) return Promise.resolve({ data: null, error: panne })
                if (table !== 'profiles' || col !== 'id')
                  throw new Error(`lecture inattendue ${table}.${col}`)
                const ligne = etat.profils.get(val)
                if (!ligne) {
                  return Promise.resolve(
                    mode === 'single'
                      ? {
                          data: null,
                          error: {
                            message: 'JSON object requested, multiple (or no) rows returned',
                            code: 'PGRST116',
                          },
                        }
                      : { data: null, error: null },
                  )
                }
                const data: Record<string, unknown> = {}
                for (const c of colonnes.split(',').map((s) => s.trim()))
                  data[c] = (ligne as Record<string, unknown>)[c]
                return Promise.resolve({ data, error: null })
              }
              return {
                single: () => lire('single'),
                maybeSingle: () => lire('maybeSingle'),
              }
            },
          }
        },
        delete() {
          return {
            eq(col: string, val: string) {
              journal.push(`supprimerProfil(${val})`)
              const panne = etat.pannes.supprimerProfil
              if (panne) return Promise.resolve({ data: null, error: panne })
              if (table !== 'profiles' || col !== 'id')
                throw new Error(`suppression inattendue ${table}.${col}`)
              etat.profils.delete(val)
              return Promise.resolve({ data: null, error: null })
            },
          }
        },
      }
    },
    auth: {
      getUser(jeton: string) {
        journal.push('getUser')
        const panne = etat.pannes.getUser
        if (panne) return Promise.resolve({ data: { user: null }, error: panne })
        const id = etat.jetons[jeton]
        const user = id ? etat.identites.get(id) : undefined
        if (!user)
          return Promise.resolve({
            data: { user: null },
            error: { message: 'invalid JWT', status: 401 },
          })
        return Promise.resolve({ data: { user }, error: null })
      },
      admin: {
        getUserById(id: string) {
          journal.push(`getUserById(${id})`)
          const panne = etat.pannes.getUserById
          if (panne) return Promise.resolve({ data: { user: null }, error: panne })
          const user = etat.identites.get(id)
          if (!user)
            return Promise.resolve({
              data: { user: null },
              error: { message: 'User not found', status: 404 },
            })
          return Promise.resolve({ data: { user }, error: null })
        },
        createUser(attrs: {
          email: string
          password: string
          email_confirm?: boolean
          user_metadata?: Record<string, unknown>
        }) {
          journal.push(`createUser(${attrs.email})`)
          const panne = etat.pannes.createUser
          if (panne) return Promise.resolve({ data: { user: null }, error: panne })
          for (const u of etat.identites.values())
            if (u.email === attrs.email)
              return Promise.resolve({
                data: { user: null },
                error: {
                  message: 'A user with this email address has already been registered',
                  code: 'email_exists',
                  status: 422,
                },
              })
          const user = {
            id: `nouveau-${idSuivant++}`,
            email: attrs.email,
            created_at: new Date().toISOString(),
            email_confirm: attrs.email_confirm,
            user_metadata: attrs.user_metadata,
          }
          etat.identites.set(user.id, user)
          return Promise.resolve({ data: { user }, error: null })
        },
        updateUserById(id: string, attrs: { ban_duration?: string }) {
          journal.push(`updateUserById(${id}, ban=${attrs.ban_duration})`)
          const panne =
            attrs.ban_duration === 'none'
              ? (etat.panneLeveeBan ?? etat.pannes.updateUserById)
              : etat.pannes.updateUserById
          if (panne) return Promise.resolve({ data: { user: null }, error: panne })
          const user = etat.identites.get(id)
          if (!user)
            return Promise.resolve({
              data: { user: null },
              error: { message: 'User not found', status: 404 },
            })
          if (attrs.ban_duration === 'none') delete user.banned_until
          else if (attrs.ban_duration) user.banned_until = `ban:${attrs.ban_duration}`
          return Promise.resolve({ data: { user }, error: null })
        },
        deleteUser(id: string) {
          journal.push(`deleteUser(${id})`)
          const panne = etat.pannes.deleteUser
          if (panne) return Promise.resolve({ data: null, error: panne })
          if (!etat.identites.delete(id))
            return Promise.resolve({
              data: null,
              error: { message: 'User not found', status: 404 },
            })
          return Promise.resolve({ data: {}, error: null })
        },
      },
    },
  }

  return {
    client,
    journal,
    appels,
    /** Dépendances à passer à `traiter` (variables façon prod hébergée). */
    deps(variables: Record<string, string | undefined> = VARIABLES_PROD) {
      return {
        lire: (n: string) => variables[n],
        creerClient: (url: string, cle: string) => {
          appels.push({ url, cle })
          return client as never
        },
      }
    },
  }
}

/** Projet hébergé : la clé serveur lue est SB_SECRET_KEY. */
export const VARIABLES_PROD: Record<string, string> = {
  SUPABASE_URL: 'https://projet-essai.supabase.co',
  SB_SECRET_KEY: 'sb_secret_essai',
}

export const ADMIN: Identite = {
  id: 'admin-1',
  email: 'admin@exemple.test',
  created_at: '2026-01-01T00:00:00Z',
}

/** État de départ : un admin (jeton `jeton-admin`) et un utilisateur simple. */
export function etatDeBase(): EtatFaux {
  return {
    jetons: { 'jeton-admin': 'admin-1', 'jeton-user': 'user-1' },
    profils: new Map([
      ['admin-1', { id: 'admin-1', role: 'admin' }],
      ['user-1', { id: 'user-1', role: 'utilisateur' }],
    ]),
    identites: new Map([
      ['admin-1', { ...ADMIN }],
      [
        'user-1',
        { id: 'user-1', email: 'user@exemple.test', created_at: '2026-01-01T00:00:00Z' },
      ],
    ]),
    pannes: {},
  }
}

export function requete(
  corps: unknown,
  options: { jeton?: string | null; methode?: string; brut?: string } = {},
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  const jeton = options.jeton === undefined ? 'jeton-admin' : options.jeton
  if (jeton !== null) headers.set('Authorization', `Bearer ${jeton}`)
  const methode = options.methode ?? 'POST'
  return new Request('http://localhost/functions/v1/fonction', {
    method: methode,
    headers,
    body:
      methode === 'GET' || methode === 'OPTIONS'
        ? undefined
        : (options.brut ?? JSON.stringify(corps)),
  })
}

export async function lire(res: Response): Promise<{ status: number; corps: Record<string, unknown>; texte: string }> {
  const texte = await res.text()
  let corps: Record<string, unknown> = {}
  try {
    corps = JSON.parse(texte)
  } catch {
    // `ok` du pré-vol CORS
  }
  return { status: res.status, corps, texte }
}

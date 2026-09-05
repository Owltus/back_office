import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'

import { supabase } from '#/lib/supabase.ts'
import {
  backendHealth,
  createSingleFlight,
  isOutageError,
} from '#/lib/backendHealth.ts'
import { errorMessage } from '#/lib/errors.ts'
import type { Profile, UserRole } from '#/lib/repjour/types.ts'
import { atLeast, gradeOf, levelOf } from '#/lib/permissions/index.ts'
import type {
  Grade,
  PageKey,
  PageLevel,
  PagePermissions,
} from '#/lib/permissions/index.ts'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  role: UserRole | null
  /** Grade dérivé du rôle : 'admin' (tout) ou 'utilisateur' (droits par page). */
  grade: Grade
  /** Droits par page de l'utilisateur (page absente = aucun accès). */
  permissions: PagePermissions
  /** Résolution de la SESSION (locale via `getSession`, quasi instantanée). */
  loading: boolean
  /** Résolution du PROFIL (aller-retour réseau), menée EN ARRIÈRE-PLAN. */
  profileLoading: boolean
  /** Résolution des PERMISSIONS (réseau), EN ARRIÈRE-PLAN, distincte du profil. */
  permissionsLoading: boolean
  /** Les droits de l'utilisateur COURANT ont-ils été résolus au moins une fois
   *  (lecture réussie ou cache local) ? Faux = « on ne sait pas encore », à ne
   *  jamais confondre avec « aucun droit ». */
  permsResolved: boolean
  /** Le backend est-il injoignable (disjoncteur ouvert, `lib/backendHealth`) ? */
  backendDown: boolean
  /** Dernière erreur de lecture profil/droits (message court), null sinon. */
  authReadError: string | null
  /** L'utilisateur a-t-il au moins le niveau `min` sur cette page ? */
  can: (page: PageKey, min: PageLevel) => boolean
  /** Niveau effectif de l'utilisateur sur cette page (null = aucun accès). */
  pageLevel: (page: PageKey) => PageLevel | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  refreshPermissions: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

/**
 * Cadence de revalidation des droits EN SÉANCE (décision du 2026-09-05) :
 * toutes les 3 min tant que l'onglet est visible, plus une fois au retour sur
 * l'onglet, avec au moins 60 s entre deux. Avant : 2 min + chaque retour
 * d'onglet + chaque événement d'auth, sans déduplication — 320 000 lectures
 * de profil/droits en cinq mois pour six comptes, et une tempête de réessais
 * qui a empêché la base de se relever lors de la panne du 2026-09-05.
 */
const REVALIDATE_INTERVAL_MS = 180_000
const REVALIDATE_MIN_GAP_MS = 60_000

/**
 * Cache local du profil : au rechargement, le rôle est disponible IMMÉDIATEMENT
 * (pas d'aller-retour réseau bloquant). Le fetch réseau ne fait que réconcilier
 * la valeur en arrière-plan. Clé versionnée pour pouvoir invalider le format.
 */
const PROFILE_CACHE_KEY = 'bo.auth.profile.v1'

function readCachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY)
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch {
    // localStorage indisponible (SSR, mode privé) : non bloquant.
    return null
  }
}

function writeCachedProfile(profile: Profile | null) {
  try {
    if (profile) {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile))
    } else {
      localStorage.removeItem(PROFILE_CACHE_KEY)
    }
  } catch {
    // Ignoré : le cache n'est qu'une optimisation, jamais une source de vérité.
  }
}

/**
 * Cache local des permissions par page — même principe que le profil : au
 * rechargement, les droits sont disponibles IMMÉDIATEMENT, le fetch ne fait que
 * réconcilier en arrière-plan. Stocké avec l'`userId` pour ne jamais servir les
 * droits d'un autre compte (poste partagé).
 */
const PERMS_CACHE_KEY = 'bo.auth.perms.v1'

function readCachedPerms(userId: string): PagePermissions | null {
  try {
    const raw = localStorage.getItem(PERMS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { userId: string; perms: PagePermissions }
    return parsed.userId === userId ? parsed.perms : null
  } catch {
    return null
  }
}

function writeCachedPerms(userId: string, perms: PagePermissions) {
  try {
    localStorage.setItem(PERMS_CACHE_KEY, JSON.stringify({ userId, perms }))
  } catch {
    // Ignoré : cache = optimisation, jamais source de vérité.
  }
}

function clearCachedPerms() {
  try {
    localStorage.removeItem(PERMS_CACHE_KEY)
  } catch {
    // Ignoré.
  }
}

/**
 * Session persistée par auth-js (`sb-<ref>-auth-token`, même dérivation de clé
 * que la bibliothèque : sous-domaine de l'URL du projet). Lue UNIQUEMENT quand
 * le rafraîchissement du jeton échoue pour cause de PANNE : la session est
 * alors probablement encore valide et l'utilisateur est gardé connecté (bandeau
 * de panne) au lieu d'être renvoyé sur /login. Jamais écrite ici.
 */
function readPersistedSessionUser(): User | null {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
    if (!url) return null
    const ref = new URL(url).hostname.split('.')[0]
    const raw = localStorage.getItem(`sb-${ref}-auth-token`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { user?: User } | null
    return parsed?.user && typeof parsed.user.id === 'string' ? parsed.user : null
  } catch {
    return null
  }
}

/**
 * Fournit la session Supabase et le profil (donc le rôle) à TOUTE l'application.
 *
 * Monté à la racine (`__root.tsx`) : l'authentification protège l'ensemble du
 * Back Office, pas seulement l'îlot `/repjour`. La garde globale `AppAuthGate`
 * s'appuie dessus pour rediriger tout visiteur non connecté vers `/login`.
 *
 * OPTIMISATION DU CHARGEMENT — la garde ne bloque PAS sur le profil :
 *   - `loading` (session) est levé dès que `getSession()` répond. Or `getSession`
 *     lit le `localStorage` : c'est quasi instantané → l'app s'affiche sans
 *     attendre le réseau.
 *   - le profil (donc le rôle) ET les permissions par page sont chargés EN
 *     ARRIÈRE-PLAN. Pour un utilisateur déjà venu, ils sont hydratés depuis le
 *     cache local → rôle et droits disponibles tout de suite, sans blocage.
 *   - `profileLoading` / `permissionsLoading` signalent ces résolutions réseau ;
 *     les gardes (`PageGuard`) s'en servent pour ne pas confondre « en cours de
 *     chargement » et « aucun accès ».
 *
 * RÉSILIENCE (2026-09-05) :
 *   - une seule lecture profil (et une seule lecture droits) en vol à la fois
 *     (single-flight) ; le disjoncteur `backendHealth` court-circuite les
 *     relectures tant qu'une tentative n'est pas due ;
 *   - une erreur réseau ne touche à RIEN (ni état, ni cache) et est exposée via
 *     `authReadError` / `backendDown` ; seule une réponse « 0 ligne » éjecte ;
 *   - `TOKEN_REFRESHED` ne relit plus les droits ; la revalidation en séance
 *     suit une cadence bornée (voir constantes ci-dessus).
 *
 * Composant 100 % client. Sous SSR, `loading` reste `true` (les effets ne
 * s'exécutent pas côté serveur) : le rendu serveur et le premier rendu client
 * produisent le même DOM → pas de divergence d'hydratation.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  // Hydratation optimiste du profil depuis le cache local (rôle dispo au boot).
  const [profile, setProfile] = useState<Profile | null>(() =>
    readCachedProfile(),
  )
  // Hydratation optimiste des permissions depuis le cache (droits dispo au boot).
  const [permissions, setPermissions] = useState<PagePermissions>(() => {
    const cached = readCachedProfile()
    return (cached && readCachedPerms(cached.id)) ?? {}
  })
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [permissionsLoading, setPermissionsLoading] = useState(false)
  const [permsResolved, setPermsResolved] = useState<boolean>(() => {
    const cached = readCachedProfile()
    return !!cached && readCachedPerms(cached.id) !== null
  })
  const [authReadError, setAuthReadError] = useState<string | null>(null)
  const backendDown = useSyncExternalStore(
    backendHealth.subscribe,
    () => backendHealth.getState().status === 'down',
    () => false,
  )

  // Id du profil actuellement chargé : évite un flash de `profileLoading` quand
  // un profil (cache ou déjà chargé) correspond déjà à l'utilisateur courant.
  const profileUserIdRef = useRef<string | null>(
    readCachedProfile()?.id ?? null,
  )
  // Idem pour les permissions (évite un flash de `permissionsLoading`).
  const permsUserIdRef = useRef<string | null>(readCachedProfile()?.id ?? null)
  // Utilisateur courant, lisible sans passer par `getSession()` (verrou auth-js).
  const userIdRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    const singleProfile = createSingleFlight<void>()
    const singlePerms = createSingleFlight<void>()
    let lastRevalidateAt = 0

    function resolveProfile(userId: string): Promise<void> {
      // Disjoncteur ouvert : on n'appelle PAS le réseau. C'est le chemin
      // « erreur » : rien n'est écrit, rien n'est effacé, on retentera.
      if (backendHealth.shouldSkip()) return Promise.resolve()
      return singleProfile(userId, async () => {
        // Le rôle est-il déjà disponible pour cet utilisateur (état ou cache) ?
        const alreadyHave =
          profileUserIdRef.current === userId ||
          readCachedProfile()?.id === userId
        if (!alreadyHave) setProfileLoading(true)

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle()
        if (!active) return

        // Erreur réseau/transitoire : on ne touche à RIEN (ni profil, ni session,
        // ni cache). Surtout pas d'éjection sur un simple aléa réseau. En cas
        // de PANNE, `profileLoading` reste tel quel : sans cache, le squelette
        // continue (le bandeau explique) plutôt qu'un faux « aucun accès ».
        if (error) {
          setAuthReadError(errorMessage(error))
          if (!isOutageError(error)) setProfileLoading(false)
          return
        }

        // Requête aboutie mais AUCUNE ligne : le profil n'existe plus → le compte a
        // été supprimé/révoqué par un admin. On éjecte la session encore ouverte :
        // le token JWT reste techniquement valide jusqu'à son expiration (~1 h),
        // donc c'est CETTE détection qui déconnecte réellement l'utilisateur en
        // séance (signOut → onAuthStateChange → AppAuthGate renvoie vers /login).
        if (!data) {
          clearProfile()
          await supabase.auth.signOut()
          return
        }

        const next = data as Profile
        setProfile(next)
        writeCachedProfile(next)
        profileUserIdRef.current = userId
        setProfileLoading(false)
        setAuthReadError(null)
      })
    }

    // Charge les droits par page. Contrairement au profil, « 0 permission » est un
    // état LÉGITIME (utilisateur sans page accordée) : ne JAMAIS éjecter ici.
    function resolvePermissions(userId: string): Promise<void> {
      if (backendHealth.shouldSkip()) return Promise.resolve()
      return singlePerms(userId, async () => {
        const alreadyHave =
          permsUserIdRef.current === userId ||
          readCachedPerms(userId) !== null
        if (!alreadyHave) setPermissionsLoading(true)

        const { data, error } = await supabase
          .from('user_page_permissions')
          .select('page, level')
          .eq('user_id', userId)
        if (!active) return

        // Aléa réseau : on garde le cache tel quel, aucune éjection. Panne :
        // `permissionsLoading` reste tel quel (voir resolveProfile).
        if (error) {
          setAuthReadError(errorMessage(error))
          if (!isOutageError(error)) setPermissionsLoading(false)
          return
        }

        const map: PagePermissions = {}
        for (const row of (data ?? []) as Array<{ page: PageKey; level: PageLevel }>) {
          map[row.page] = row.level
        }
        setPermissions(map)
        writeCachedPerms(userId, map)
        permsUserIdRef.current = userId
        setPermissionsLoading(false)
        setPermsResolved(true)
        setAuthReadError(null)
      })
    }

    function clearProfile() {
      setProfile(null)
      writeCachedProfile(null)
      profileUserIdRef.current = null
      setProfileLoading(false)
    }

    function clearPerms() {
      setPermissions({})
      clearCachedPerms()
      permsUserIdRef.current = null
      setPermissionsLoading(false)
      setPermsResolved(false)
    }

    /** Résolution complète pour un utilisateur (connexion, changement de compte). */
    function resolveAll(userId: string) {
      lastRevalidateAt = Date.now()
      void resolveProfile(userId)
      void resolvePermissions(userId)
    }

    function applyUser(nextUser: User | null) {
      setUser(nextUser)
      userIdRef.current = nextUser?.id ?? null
      setLoading(false)
      if (nextUser) {
        // Purge d'un cache appartenant à un autre compte (changement d'utilisateur).
        const cached = readCachedProfile()
        if (cached && cached.id !== nextUser.id) {
          clearProfile()
          clearPerms()
        }
        setPermsResolved(readCachedPerms(nextUser.id) !== null)
      } else {
        clearProfile()
        clearPerms()
      }
    }

    // Session initiale : résolution RAPIDE (getSession lit le localStorage). On
    // lève `loading` sans attendre le profil ni les permissions (arrière-plan).
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!active) return
      let nextUser = session?.user ?? null
      // Jeton expiré ET backend en panne pendant le rafraîchissement : la
      // session persistée est probablement encore valide. On garde l'utilisateur
      // connecté (bandeau de panne) ; l'auto-refresh d'auth-js retentera et
      // `onAuthStateChange` remettra tout d'aplomb au retour du backend. Un
      // jeton RÉVOQUÉ (4xx) n'est pas une panne : renvoi sur /login comme avant.
      if (!nextUser && error && isOutageError(error)) {
        nextUser = readPersistedSessionUser()
      }
      applyUser(nextUser)
      if (nextUser) resolveAll(nextUser.id)
    })

    // Événements d'auth. Relecture des droits UNIQUEMENT quand l'identité change
    // (connexion, changement de compte) ou sur USER_UPDATED. `TOKEN_REFRESHED`
    // et `INITIAL_SESSION` (déjà couvert par getSession) ne relisent rien ; un
    // `SIGNED_IN` rejoué par auth-js pour le MÊME compte (retour d'onglet,
    // synchronisation entre onglets) passe par la cadence bornée.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null
      const previousId = userIdRef.current
      applyUser(nextUser)
      if (!nextUser) return
      if (nextUser.id !== previousId || event === 'USER_UPDATED') {
        resolveAll(nextUser.id)
      } else if (event === 'SIGNED_IN') {
        revalidate()
      }
    })

    // Éjection / mise à jour EN SÉANCE : re-vérifier compte + droits à cadence
    // bornée, onglet visible seulement. Propage un changement de droits fait par
    // un admin sans attendre une reconnexion ; `resolveProfile` éjecte si le
    // compte a disparu.
    function revalidate() {
      const uid = userIdRef.current
      if (!uid) return
      if (document.visibilityState !== 'visible') return
      const t = Date.now()
      if (t - lastRevalidateAt < REVALIDATE_MIN_GAP_MS) return
      lastRevalidateAt = t
      void resolveProfile(uid)
      void resolvePermissions(uid)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') revalidate()
    }
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(revalidate, REVALIDATE_INTERVAL_MS)

    return () => {
      active = false
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(interval)
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    userIdRef.current = null
    setProfile(null)
    writeCachedProfile(null)
    profileUserIdRef.current = null
    setProfileLoading(false)
    setPermissions({})
    clearCachedPerms()
    permsUserIdRef.current = null
    setPermissionsLoading(false)
    setPermsResolved(false)
    setAuthReadError(null)
  }

  const grade = gradeOf(profile?.role)

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role: profile?.role ?? null,
        grade,
        permissions,
        loading,
        profileLoading,
        permissionsLoading,
        permsResolved,
        backendDown,
        authReadError,
        can: (page, min) => atLeast(permissions, grade, page, min),
        pageLevel: (page) => levelOf(permissions, grade, page),
        signIn,
        signOut,
        // Relectures manuelles (page profil). Sur erreur : on lève, et on ne
        // touche NI à l'état NI au cache (une panne n'efface jamais le cache).
        refreshProfile: async () => {
          if (!user) return
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle()
          if (error) throw error
          const next = (data as Profile | null) ?? null
          setProfile(next)
          writeCachedProfile(next)
          profileUserIdRef.current = next ? user.id : null
        },
        refreshPermissions: async () => {
          if (!user) return
          const { data, error } = await supabase
            .from('user_page_permissions')
            .select('page, level')
            .eq('user_id', user.id)
          if (error) throw error
          const map: PagePermissions = {}
          for (const row of (data ?? []) as Array<{ page: PageKey; level: PageLevel }>) {
            map[row.page] = row.level
          }
          setPermissions(map)
          writeCachedPerms(user.id, map)
          permsUserIdRef.current = user.id
          setPermsResolved(true)
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

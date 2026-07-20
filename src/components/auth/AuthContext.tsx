import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'

import { supabase } from '#/lib/supabase.ts'
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

function readCachedPerms(userId: string): PagePermissions {
  try {
    const raw = localStorage.getItem(PERMS_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { userId: string; perms: PagePermissions }
    return parsed.userId === userId ? parsed.perms : {}
  } catch {
    return {}
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
 * Fournit la session Supabase et le profil (donc le rôle) à TOUTE l'application.
 *
 * Monté à la racine (`__root.tsx`) : l'authentification protège l'ensemble du
 * Back Office, pas seulement l'îlot `/repjour`. La garde globale `AppAuthGate`
 * s'appuie dessus pour rediriger tout visiteur non connecté vers `/login`.
 *
 * OPTIMISATION DU CHARGEMENT — la garde ne bloque PLUS sur le profil :
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
 * Composant 100 % client. Sous SSR, `loading` reste `true` (les effets ne
 * s'exécutent pas côté serveur) : le rendu serveur et le premier rendu client
 * produisent le même DOM (un spinner via `AppAuthGate`) → pas de divergence
 * d'hydratation. L'effet résout ensuite la session côté client.
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
    return cached ? readCachedPerms(cached.id) : {}
  })
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [permissionsLoading, setPermissionsLoading] = useState(false)

  // Id du profil actuellement chargé : évite un flash de `profileLoading` quand
  // un profil (cache ou déjà chargé) correspond déjà à l'utilisateur courant.
  const profileUserIdRef = useRef<string | null>(
    readCachedProfile()?.id ?? null,
  )
  // Idem pour les permissions (évite un flash de `permissionsLoading`).
  const permsUserIdRef = useRef<string | null>(readCachedProfile()?.id ?? null)

  useEffect(() => {
    let active = true

    async function resolveProfile(userId: string) {
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

      // Erreur réseau/transitoire : on ne touche à RIEN (ni profil, ni session).
      // Surtout pas d'éjection sur un simple aléa réseau (faux positif).
      if (error) {
        setProfileLoading(false)
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
    }

    // Charge les droits par page. Contrairement au profil, « 0 permission » est un
    // état LÉGITIME (utilisateur sans page accordée) : ne JAMAIS éjecter ici.
    async function resolvePermissions(userId: string) {
      const alreadyHave =
        permsUserIdRef.current === userId ||
        Object.keys(readCachedPerms(userId)).length > 0
      if (!alreadyHave) setPermissionsLoading(true)

      const { data, error } = await supabase
        .from('user_page_permissions')
        .select('page, level')
        .eq('user_id', userId)
      if (!active) return

      // Aléa réseau : on garde le cache tel quel, aucune éjection.
      if (error) {
        setPermissionsLoading(false)
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
    }

    // Session initiale : résolution RAPIDE (getSession lit le localStorage). On
    // lève `loading` sans attendre le profil ni les permissions (arrière-plan).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      const nextUser = session?.user ?? null
      setUser(nextUser)
      setLoading(false)
      if (nextUser) {
        // Purge d'un cache appartenant à un autre compte (changement d'utilisateur).
        const cached = readCachedProfile()
        if (cached && cached.id !== nextUser.id) {
          clearProfile()
          clearPerms()
        }
        resolveProfile(nextUser.id)
        resolvePermissions(nextUser.id)
      } else {
        clearProfile()
        clearPerms()
      }
    })

    // Événements d'auth (connexion, déconnexion, refresh de token). Le refresh
    // de token du même utilisateur ne redéclenche pas de spinner visible
    // (alreadyHave === true).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      setUser(nextUser)
      setLoading(false)
      if (nextUser) {
        resolveProfile(nextUser.id)
        resolvePermissions(nextUser.id)
      } else {
        clearProfile()
        clearPerms()
      }
    })

    // Éjection / mise à jour EN SÉANCE : re-vérifier compte + droits au retour sur
    // l'onglet et à intervalle régulier. Propage un changement de droits fait par
    // un admin sans attendre une reconnexion ; `resolveProfile` éjecte si le
    // compte a disparu.
    async function revalidate() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const uid = session?.user.id
      if (uid) {
        void resolveProfile(uid)
        void resolvePermissions(uid)
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void revalidate()
    }
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(() => void revalidate(), 120_000)

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
    setProfile(null)
    writeCachedProfile(null)
    profileUserIdRef.current = null
    setProfileLoading(false)
    setPermissions({})
    clearCachedPerms()
    permsUserIdRef.current = null
    setPermissionsLoading(false)
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
        can: (page, min) => atLeast(permissions, grade, page, min),
        pageLevel: (page) => levelOf(permissions, grade, page),
        signIn,
        signOut,
        refreshProfile: async () => {
          if (!user) return
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle()
          const next = (data as Profile | null) ?? null
          setProfile(next)
          writeCachedProfile(next)
          profileUserIdRef.current = next ? user.id : null
        },
        refreshPermissions: async () => {
          if (!user) return
          const { data } = await supabase
            .from('user_page_permissions')
            .select('page, level')
            .eq('user_id', user.id)
          const map: PagePermissions = {}
          for (const row of (data ?? []) as Array<{ page: PageKey; level: PageLevel }>) {
            map[row.page] = row.level
          }
          setPermissions(map)
          writeCachedPerms(user.id, map)
          permsUserIdRef.current = user.id
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

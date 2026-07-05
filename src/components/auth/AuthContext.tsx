import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'

import { supabase } from '#/lib/supabase.ts'
import type { Profile, UserRole } from '#/lib/repjour/types.ts'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  role: UserRole | null
  /** Résolution de la SESSION (locale via `getSession`, quasi instantanée). */
  loading: boolean
  /** Résolution du PROFIL (aller-retour réseau), menée EN ARRIÈRE-PLAN. */
  profileLoading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
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
 *   - le profil (donc le rôle) est chargé EN ARRIÈRE-PLAN. Pour un utilisateur
 *     déjà venu, il est hydraté depuis le cache local → rôle disponible tout de
 *     suite, sans aller-retour bloquant.
 *   - `profileLoading` signale la résolution réseau du profil ; les gardes par
 *     rôle (`ProtectedRoute`) s'en servent pour ne pas confondre « profil en
 *     cours de chargement » et « aucun profil » (ex-D13 bug#2).
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
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  // Id du profil actuellement chargé : évite un flash de `profileLoading` quand
  // un profil (cache ou déjà chargé) correspond déjà à l'utilisateur courant.
  const profileUserIdRef = useRef<string | null>(
    readCachedProfile()?.id ?? null,
  )

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

    function clearProfile() {
      setProfile(null)
      writeCachedProfile(null)
      profileUserIdRef.current = null
      setProfileLoading(false)
    }

    // Session initiale : résolution RAPIDE (getSession lit le localStorage). On
    // lève `loading` sans attendre le profil, chargé ensuite en arrière-plan.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      const nextUser = session?.user ?? null
      setUser(nextUser)
      setLoading(false)
      if (nextUser) {
        // Purge d'un cache appartenant à un autre compte (changement d'utilisateur).
        const cached = readCachedProfile()
        if (cached && cached.id !== nextUser.id) clearProfile()
        resolveProfile(nextUser.id)
      } else {
        clearProfile()
      }
    })

    // Événements d'auth (connexion, déconnexion, refresh de token). Le refresh
    // de token du même utilisateur ne redéclenche pas de `profileLoading`
    // visible (alreadyHave === true), donc pas de flash de spinner.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      setUser(nextUser)
      setLoading(false)
      if (nextUser) {
        resolveProfile(nextUser.id)
      } else {
        clearProfile()
      }
    })

    // Éjection EN SÉANCE : re-vérifier que le compte existe toujours, au retour
    // sur l'onglet et à intervalle régulier. Sans cela, un compte supprimé
    // garderait l'accès jusqu'à l'expiration de son token (~1 h). `resolveProfile`
    // se charge de l'éjection s'il n'y a plus de profil.
    async function revalidate() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const uid = session?.user.id
      if (uid) void resolveProfile(uid)
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
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role: profile?.role ?? null,
        loading,
        profileLoading,
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

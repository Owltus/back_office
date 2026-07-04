import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'

import { supabase } from '#/lib/supabase.ts'
import type { Profile, UserRole } from '#/lib/repjour/types.ts'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  role: UserRole | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

/**
 * Fournit la session Supabase et le profil (donc le rôle) à TOUTE l'application.
 *
 * Monté à la racine (`__root.tsx`) : l'authentification protège désormais
 * l'ensemble du Back Office, pas seulement l'îlot `/repjour` (décision D3 =
 * option B, à la demande de l'utilisateur). La garde globale `AppAuthGate`
 * s'appuie dessus pour rediriger tout visiteur non connecté vers `/login`.
 *
 * Composant 100 % client (effets + `localStorage`). Sous SSR, `loading` reste
 * `true` (les effets ne s'exécutent pas côté serveur) : le rendu serveur et le
 * premier rendu client produisent donc le même DOM (un spinner via
 * `AppAuthGate`), ce qui évite toute divergence d'hydratation. L'effet résout
 * ensuite la session côté client.
 *
 * Correction D13 bug#1 (race de chargement du profil) : au montage comme sur les
 * événements d'auth, on ATTEND `fetchProfile` avant de repasser `loading` à
 * `false`, pour que le rôle soit disponible quand la garde s'exécute.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // Id du profil actuellement chargé : sert à ne PAS repasser en `loading` lors
  // d'un simple rafraîchissement de token (même utilisateur), ce qui éviterait
  // un flash de spinner sur une page déjà rendue.
  const profileUserIdRef = useRef<string | null>(null)

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    const nextProfile = (data as Profile | null) ?? null
    setProfile(nextProfile)
    profileUserIdRef.current = nextProfile ? userId : null
  }

  useEffect(() => {
    // Session initiale : on ATTEND le profil avant de lever `loading` (D13 bug#1).
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        await fetchProfile(session.user.id)
      }
      setLoading(false)
    })

    // Événements d'auth (connexion, déconnexion, refresh de token). On ATTEND le
    // profil avant de lever `loading` (D13 bug#1), mais uniquement quand un
    // nouveau profil doit être chargé — un refresh de token du même utilisateur
    // ne déclenche donc pas de spinner.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      setUser(nextUser)

      if (nextUser) {
        const needsLoad = profileUserIdRef.current !== nextUser.id
        if (needsLoad) setLoading(true)
        fetchProfile(nextUser.id).finally(() => {
          if (needsLoad) setLoading(false)
        })
      } else {
        setProfile(null)
        profileUserIdRef.current = null
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    profileUserIdRef.current = null
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role: profile?.role ?? null,
        loading,
        signIn,
        signOut,
        refreshProfile: async () => {
          if (user) await fetchProfile(user.id)
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

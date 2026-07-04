import type { ReactNode } from 'react'
import { Navigate, useRouterState } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { Navbar } from '#/components/Navbar.tsx'

/**
 * Garde d'authentification GLOBALE de l'application.
 *
 * Toute page exige une session (décision D3 = option B) :
 *   - route `/login` → toujours accessible, rendue sans le chrome (Navbar) ;
 *   - `loading` → spinner plein écran (état rendu aussi côté SSR, donc pas de
 *     divergence d'hydratation : serveur et premier rendu client sont identiques) ;
 *   - pas de session → redirection vers `/login` (aucun contenu protégé rendu) ;
 *   - session présente → chrome complet (Navbar + contenu).
 *
 * La garde est ergonomique ; la sécurité réelle des données reste assurée par
 * les RLS Supabase.
 */
export function AppAuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // La page de connexion est toujours accessible, sans Navbar.
  if (pathname === '/login') {
    return (
      <main className="flex h-dvh flex-col overflow-hidden">{children}</main>
    )
  }

  // Session pas encore résolue : spinner (identique SSR ↔ premier rendu client).
  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  // Non connecté : aucune page protégée n'est rendue, on renvoie vers /login.
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Connecté : chrome complet.
  return (
    <div className="flex h-dvh flex-col overflow-hidden print:h-auto print:overflow-visible">
      <Navbar />
      <main
        key={pathname}
        className="app-scroll flex flex-1 flex-col overflow-y-auto motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 print:overflow-visible"
      >
        {children}
      </main>
    </div>
  )
}

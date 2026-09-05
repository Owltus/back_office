import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate, useRouterState } from '@tanstack/react-router'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { BackendStatusBanner } from '#/components/shared/BackendStatusBanner.tsx'
import { EasterEggs } from '#/components/shared/EasterEggs.tsx'
import { Navbar } from '#/components/Navbar.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { RouteSkeleton } from '#/components/shared/skeleton/RouteSkeleton.tsx'

/** Vrai après `delayMs` de montage : sert à ne parler d'un chargement lent
 *  qu'une fois qu'il l'est vraiment (jamais de message sur un boot normal). */
function useDelayedFlag(delayMs: number): boolean {
  const [flag, setFlag] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setFlag(true), delayMs)
    return () => window.clearTimeout(id)
  }, [delayMs])
  return flag
}

/** Délai au-delà duquel le squelette de démarrage cesse d'être muet. */
const SLOW_BOOT_MS = 5_000

/**
 * Squelette de démarrage : silhouette de barre de navigation + zone de contenu en
 * squelette, au lieu d'un spinner nu. Déterministe → rendu à l'identique en SSR et
 * au premier rendu client (pas de divergence d'hydratation), et l'arrivée du chrome
 * réel ne déplace rien (même hauteur de barre, même zone de contenu).
 *
 * Le corps est délégué à `RouteSkeleton`, qui réserve la barre PageHeader et
 * adapte sa forme à la route d'atterrissage (formulaire, liste, analytique ou
 * board) — le `<main>` et le padding reprennent EXACTEMENT ceux du chrome réel
 * (`app-scroll`, `flex flex-1 flex-col p-4 md:p-6`) pour ne rien décaler.
 */
function BootSkeleton({ pathname }: { pathname: string }) {
  // Après 5 s, le squelette cesse d'être muet : un texte accessible dit que le
  // chargement dure ; si le disjoncteur est ouvert, le bandeau de statut
  // (monté au-dessus, hors du squelette décoratif) prend le relais.
  const slow = useDelayedFlag(SLOW_BOOT_MS)
  const { backendDown } = useAuth()
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header
        className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md print:hidden"
        aria-hidden="true"
      >
        <div className="flex h-16 items-center gap-3 px-4">
          <Skeleton className="size-7 rounded-md" />
          <div className="ml-2 hidden items-center gap-2 md:flex">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-20 rounded-lg" />
            ))}
          </div>
          <Skeleton className="ml-auto size-9 rounded-full" />
        </div>
      </header>
      <BackendStatusBanner />
      {slow && !backendDown && (
        <p
          role="status"
          className="border-b border-border bg-card/60 px-4 py-2 text-sm text-muted-foreground print:hidden"
        >
          Chargement plus long que prévu.
        </p>
      )}
      <main
        className="app-scroll flex flex-1 flex-col overflow-y-auto"
        aria-hidden="true"
      >
        <div className="flex flex-1 flex-col p-4 md:p-6">
          <RouteSkeleton pathname={pathname} />
        </div>
      </main>
    </div>
  )
}

/**
 * Garde d'authentification GLOBALE de l'application.
 *
 * Toute page exige une session (décision D3 = option B) :
 *   - route `/login` → toujours accessible, rendue sans le chrome (Navbar) ;
 *   - `loading` → squelette de layout (état rendu aussi côté SSR, donc pas de
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

  // La page de connexion est toujours accessible, sans Navbar. `main` en BLOC
  // (pas flex) + `overflow-y-auto` : sur une fenêtre très courte, le formulaire
  // centré défile au lieu d'être rogné en haut/bas. Le centrage anti-rognage vit
  // dans login.tsx (wrapper `min-h-full` qui grandit jusqu'au contenu — ce qui
  // n'est possible QUE si le parent est en bloc ; en flex-col il serait plafonné
  // à 100 % et le contenu déborderait sans défiler).
  if (pathname === '/login') {
    return <main className="h-dvh overflow-y-auto">{children}</main>
  }

  // Session pas encore résolue : squelette de layout (identique SSR ↔ premier
  // rendu client), plutôt qu'un spinner nu. La forme suit la route d'atterrissage.
  if (loading) {
    return <BootSkeleton pathname={pathname} />
  }

  // Non connecté : aucune page protégée n'est rendue, on renvoie vers /login.
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Connecté : chrome complet. `<main>` n'est PLUS remonté sur `pathname` : le
  // fondu d'entrée ne rejoue donc plus à chaque navigation (fini le flash d'écran
  // vide transparent entre deux pages) ; il ne joue qu'une fois, au premier montage.
  return (
    <div className="flex h-dvh flex-col overflow-hidden print:h-auto print:overflow-visible">
      <Navbar />
      <BackendStatusBanner />
      <main className="app-scroll flex flex-1 flex-col overflow-y-auto motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 print:overflow-visible">
        {children}
      </main>
      {/* Easter eggs clavier configurables (table `easter_eggs`) — montés une
          fois connecté : lecture RLS et cache Query disponibles ici. */}
      <EasterEggs />
    </div>
  )
}

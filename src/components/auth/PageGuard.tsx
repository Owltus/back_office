import type { ReactNode } from 'react'
import { Navigate, useRouterState } from '@tanstack/react-router'
import { ShieldAlert } from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { atLeast, firstAllowedPage, PAGE_BY_KEY } from '#/lib/permissions/index.ts'
import type { PageKey, PageLevel } from '#/lib/permissions/index.ts'
import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { RouteSkeleton } from '#/components/shared/skeleton/RouteSkeleton.tsx'

/**
 * Squelette de page tant que session/profil/permissions ne sont pas résolus —
 * réserve la place du board (barre PageHeader + contenu). La forme suit la route
 * (`RouteSkeleton`) : évite le saut spinner → contenu au premier accès.
 */
function GuardSkeleton({ pathname }: { pathname: string }) {
  return (
    <PageContainer>
      <RouteSkeleton pathname={pathname} />
    </PageContainer>
  )
}

/**
 * Message affiché à un utilisateur connecté qui n'a accès à AUCUNE page — donc
 * pas de page d'accueil vers laquelle le rediriger.
 */
export function NoAccessNotice() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <ShieldAlert className="size-10 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">
          Aucune page accessible
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Votre compte n'a accès à aucune page pour le moment. Contactez un
          administrateur pour obtenir des accès.
        </p>
      </div>
    </div>
  )
}

/**
 * Garde de route PAR PAGE. Remplace `ProtectedRoute` (rôle global) pour les 8
 * pages de la navbar : vérifie que l'utilisateur a au moins le niveau `min` sur
 * `page`. Sinon → redirection vers sa première page accordée (ou écran « aucun
 * accès » s'il n'en a aucune). Un grade admin a 'gestion' partout.
 *
 * `min` reste 'lecture' pour les pages : le raffinement des actions (écriture /
 * gestion) est appliqué DANS les boards, pas ici. La garde ne fait que « voir
 * ou pas ».
 *
 * Ordre des vérifications :
 *   1. `loading` → squelette (session pas encore résolue) ;
 *   2. `!user` → redirection vers `/login` ;
 *   3. niveau insuffisant MAIS profil/permissions en cours de résolution →
 *      squelette (ne pas rediriger à tort avant d'avoir les droits) ;
 *   4. niveau insuffisant confirmé → accueil accordé, ou « aucun accès » ;
 *   5. sinon → `children`.
 *
 * ERGONOMIQUE : la sécurité réelle des écritures reste assurée par les RLS
 * (`get_page_level`) côté Supabase.
 */
export function PageGuard({
  page,
  min = 'lecture',
  children,
}: {
  page: PageKey
  min?: PageLevel
  children: ReactNode
}) {
  const { user, loading, profileLoading, permissionsLoading, permissions, grade } =
    useAuth()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  if (loading) return <GuardSkeleton pathname={pathname} />
  if (!user) return <Navigate to="/login" replace />

  if (!atLeast(permissions, grade, page, min)) {
    // Droits pas encore résolus : rester en squelette plutôt que rediriger à tort.
    if (profileLoading || permissionsLoading)
      return <GuardSkeleton pathname={pathname} />
    const home = firstAllowedPage(permissions, grade)
    return home ? (
      <Navigate to={PAGE_BY_KEY[home].route} replace />
    ) : (
      <NoAccessNotice />
    )
  }

  return <>{children}</>
}

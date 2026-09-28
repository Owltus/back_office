import type { ReactNode } from 'react'
import { Navigate, useRouterState } from '@tanstack/react-router'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import {
  AccessReadErrorNotice,
  NoAccessNotice,
} from '#/components/auth/PageGuard.tsx'
import { PAGE_BY_KEY } from '#/lib/permissions/index.ts'
import { homePage } from '#/lib/permissions/navigation.ts'
import type { UserRole } from '#/lib/repjour/roles.ts'
import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { RouteSkeleton } from '#/components/shared/skeleton/RouteSkeleton.tsx'

/**
 * Squelette de page affiché tant que la session/le rôle ne sont pas résolus —
 * réserve la place du board (barre PageHeader + contenu) au lieu d'un spinner
 * recentré, pour supprimer le saut spinner → contenu au premier accès. La forme
 * suit la route gardée (`RouteSkeleton`) : un formulaire pour `/profil`, une liste
 * pour `/comptes`, etc. — plus de large « dashboard » plaqué sur une page étroite.
 */
function GuardSkeleton({ pathname }: { pathname: string }) {
  return (
    <PageContainer>
      <RouteSkeleton pathname={pathname} />
    </PageContainer>
  )
}

/**
 * Garde de route par rôle pour l'îlot `/repjour`.
 *
 * L'authentification globale (`AppAuthGate`) garantit déjà qu'un utilisateur est
 * connecté avant que toute page `/repjour` ne soit rendue ; cette garde-ci ne
 * fait donc que le gating par RÔLE. La vérification `!user` subsiste par sécurité.
 *
 * Ordre des vérifications (l'ordre est important) :
 *   1. `loading` → spinner (session pas encore résolue) ;
 *   2. `!user` → redirection vers `/login` ;
 *   3. `role === null` → RESTER en spinner sans afficher `children`
 *      (correction D13 bug#2 : la source rendait le contenu protégé alors que
 *      le profil n'était pas encore chargé, provoquant un flash) ;
 *   4. rôle non autorisé → page d'accueil du compte (`homePage`) ;
 *   5. sinon → `children`.
 *
 * La garde est ERGONOMIQUE ; la sécurité réelle reste assurée par les RLS
 * Supabase (les rôles sont vérifiés côté base).
 */
export function ProtectedRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: UserRole[]
  children: ReactNode
}) {
  const {
    user,
    role,
    loading,
    profileLoading,
    authReadError,
    permissions,
    grade,
    profile,
  } = useAuth()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // 1. Session en cours de résolution.
  if (loading) return <GuardSkeleton pathname={pathname} />

  // 2. Non connecté → page de login (normalement déjà intercepté par AppAuthGate).
  if (!user) return <Navigate to="/login" replace />

  // 3. Connecté, session résolue, mais pas encore de rôle (le profil est
  //    chargé EN ARRIÈRE-PLAN, voir AuthContext) : squelette, PAS de contenu
  //    protégé (ex-D13 bug#2). Un profil réellement absent ÉJECTE la session
  //    (AuthContext) : l'ancien écran « aucun rôle » n'avait donc aucun cas
  //    légitime et mentait après une simple erreur de lecture (revue du
  //    2026-09-28) — on montre l'erreur, avec « Réessayer ».
  if (role === null)
    return !profileLoading && authReadError !== null ? (
      <AccessReadErrorNotice />
    ) : (
      <GuardSkeleton pathname={pathname} />
    )

  // 4. Rôle connu mais non autorisé → page d'accueil DU COMPTE, même source
  //    que PageGuard et la racine (`profiles.page_order`) : l'ancien
  //    `ROLE_HOME` renvoyait sur /repjour en dur, d'où un second saut pour
  //    qui n'y a pas droit.
  if (!allowedRoles.includes(role)) {
    const home = homePage(permissions, grade, profile?.page_order)
    return home ? (
      <Navigate to={PAGE_BY_KEY[home].route} replace />
    ) : (
      <NoAccessNotice />
    )
  }

  // 5. Autorisé.
  return <>{children}</>
}

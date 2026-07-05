import type { ReactNode } from 'react'
import { Link, Navigate } from '@tanstack/react-router'
import { Loader2, ShieldAlert } from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { ROLE_HOME } from '#/lib/repjour/roles.ts'
import type { UserRole } from '#/lib/repjour/roles.ts'
import { Button } from '#/components/ui/button.tsx'

/** Spinner plein écran affiché tant que la session/le rôle ne sont pas résolus. */
function GuardSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Loader2 className="size-8 animate-spin text-primary" />
    </div>
  )
}

/**
 * Message affiché quand un utilisateur est authentifié mais n'a AUCUN profil/rôle
 * en base (ligne `profiles` absente). Sans ce garde-fou, `role` resterait `null`
 * et la garde tournerait en spinner infini. On offre une sortie vers l'accueil.
 */
function NoRoleNotice() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <ShieldAlert className="size-10 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">
          Aucun rôle attribué à ce compte
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Votre compte est connecté mais n'a pas de profil actif. Contactez un
          administrateur pour obtenir un accès à cette section.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to="/">Retour à l'accueil</Link>
      </Button>
    </div>
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
 *   4. rôle non autorisé → redirection vers `ROLE_HOME[role]` ;
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
  const { user, role, loading, profileLoading } = useAuth()

  // 1. Session en cours de résolution.
  if (loading) return <GuardSpinner />

  // 2. Non connecté → page de login (normalement déjà intercepté par AppAuthGate).
  if (!user) return <Navigate to="/login" replace />

  // 3. Connecté, session résolue, mais pas encore de rôle. Deux cas à distinguer
  //    (le profil est désormais chargé EN ARRIÈRE-PLAN, voir AuthContext) :
  //    - `profileLoading` → le fetch du profil est en cours : spinner, PAS de
  //      contenu protégé (ex-D13 bug#2, évite un flash) ;
  //    - sinon → la ligne `profiles` est réellement absente : notice avec une
  //      sortie vers l'accueil (plutôt qu'un spinner infini).
  if (role === null) return profileLoading ? <GuardSpinner /> : <NoRoleNotice />

  // 4. Rôle connu mais non autorisé → accueil du rôle.
  if (!allowedRoles.includes(role)) {
    return <Navigate to={ROLE_HOME[role]} replace />
  }

  // 5. Autorisé.
  return <>{children}</>
}

import { Link } from '@tanstack/react-router'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { ROLE_LABELS } from '#/lib/repjour/roles.ts'
import type { UserRole } from '#/lib/repjour/roles.ts'

/*
 * Sous-navigation de l'onglet RepJour (sous la Navbar globale du Back Office).
 *
 * Les liens sont filtrés par rôle (logique reprise du switch(role) de la
 * `Navigation` source), mais rendus avec des <Link> TanStack Router vers les
 * sous-routes /repjour/*.
 *
 * « Rapport » (/repjour), « Analytique » (/repjour/analytique) et « Gestion »
 * (/repjour/gestion) sont exposées à tous les rôles ; « Import » (/repjour/import)
 * n'apparaît que pour les rôles `super_utilisateur` et `admin` (mêmes rôles que
 * la garde de la route). La Gestion est visible par tous mais en lecture seule
 * pour les non-admin (readOnly géré dans le board). Le lien Comptes sera ajouté
 * à son étape (10).
 *
 * L'identité et la déconnexion sont désormais portées par la Navbar globale
 * (auth applicative) : cette barre ne montre que les liens d'onglet et, à
 * droite, un rappel du rôle courant.
 */

interface NavItem {
  to:
    | '/repjour'
    | '/repjour/analytique'
    | '/repjour/import'
    | '/repjour/gestion'
    | '/repjour/comptes'
  label: string
  exact?: boolean
}

function linksForRole(role: UserRole | null): NavItem[] {
  // Rapport, Analytique et Gestion : accessibles à tous les rôles (la Gestion
  // est en lecture seule pour les non-admin, cf. GestionBoard).
  const items: NavItem[] = [
    { to: '/repjour', label: 'Rapport', exact: true },
    { to: '/repjour/analytique', label: 'Analytique' },
    { to: '/repjour/gestion', label: 'Gestion' },
  ]

  // Import : réservé aux super_utilisateur et admin (mêmes rôles que la garde
  // ProtectedRoute de /repjour/import).
  if (role === 'super_utilisateur' || role === 'admin') {
    items.push({ to: '/repjour/import', label: 'Import' })
  }

  // Comptes : réservé à l'admin (mêmes rôles que la garde ProtectedRoute de
  // /repjour/comptes). Le Profil personnel n'est PAS exposé ici — il est
  // accessible via le menu utilisateur global.
  if (role === 'admin') {
    items.push({ to: '/repjour/comptes', label: 'Comptes' })
  }

  return items
}

export function RepjourNav() {
  const { role } = useAuth()

  const items = linksForRole(role)
  const roleLabel = role ? ROLE_LABELS[role] : ''

  return (
    <div className="border-b border-border bg-card/40 print:hidden">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-4 py-2">
        <nav className="flex items-center gap-1">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={item.exact ? { exact: true } : undefined}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              activeProps={{
                className:
                  'rounded-lg px-3 py-1.5 text-sm font-medium bg-primary/10 text-primary transition-colors',
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {roleLabel && (
          <span className="ml-auto text-xs text-muted-foreground">
            {roleLabel}
          </span>
        )}
      </div>
    </div>
  )
}

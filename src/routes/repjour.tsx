import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * Layout de l'onglet `/repjour`.
 *
 * `ssr: false` : cet onglet monte des briques 100 % navigateur (graphiques
 * recharts, html2canvas). Le rendre sans SSR évite tout crash de rendu serveur.
 *
 * L'authentification est fournie à la racine (`AppAuthGate` dans `__root.tsx`).
 * Il n'y a plus de sous-navigation d'onglet : le « Rapport » est le dashboard
 * lui-même, l'accès à l'« Analytique » se fait par un bouton dans l'en-tête du
 * dashboard, et le retour au Rapport par le lien « RepJour » de la Navbar
 * globale. Le gating par rôle des sous-pages reste assuré par `ProtectedRoute`.
 */
export const Route = createFileRoute('/repjour')({
  component: RepjourLayout,
  ssr: false,
  head: () => ({ meta: [{ title: 'RepJour — Back Office' }] }),
})

function RepjourLayout() {
  return <Outlet />
}

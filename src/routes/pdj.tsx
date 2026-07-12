import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * Layout de l'onglet `/pdj`.
 *
 * `ssr: false` : la sous-page `/pdj/analytique` monte des graphiques recharts
 * (100 % navigateur). Comme pour `/repjour`, on désactive le SSR sur tout l'îlot.
 *
 * Le « Rapport » est le board principal (`/pdj/`), l'accès à l'« Analytique » se
 * fait par un bouton dans l'en-tête du board, retour par le lien « PDJ » de la
 * Navbar globale. L'authentification est fournie à la racine (`AppAuthGate`).
 */
export const Route = createFileRoute('/pdj')({
  component: PdjLayout,
  ssr: false,
  head: () => ({ meta: [{ title: 'PDJ — Back Office' }] }),
})

function PdjLayout() {
  return <Outlet />
}

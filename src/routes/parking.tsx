import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * Layout de l'onglet `/parking`.
 *
 * `ssr: false` : la sous-page `/parking/analytique` monte des graphiques recharts
 * (100 % navigateur). Comme pour `/repjour` et `/pdj`, on désactive le SSR sur
 * tout l'îlot.
 *
 * Le planning est le board principal (`/parking/`), l'accès à l'« Analytique » se
 * fait par un bouton dans l'en-tête du board, retour par le lien « Parking » de la
 * Navbar globale. L'authentification est fournie à la racine (`AppAuthGate`).
 */
export const Route = createFileRoute('/parking')({
  component: ParkingLayout,
  ssr: false,
  head: () => ({ meta: [{ title: 'Parking — Back Office' }] }),
})

function ParkingLayout() {
  return <Outlet />
}

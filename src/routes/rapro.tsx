import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * Layout de l'onglet `/rapro`.
 *
 * `ssr: false` : la sous-page `/rapro/analytique` monte des vues 100 %
 * navigateur (comme `/pdj`). On désactive le SSR sur tout l'îlot.
 *
 * Le « Rapprochement » est le board principal (`/rapro/`), l'accès à
 * l'« Analytique » se fait par un bouton dans l'en-tête du board, retour par le
 * lien « Rapprochement » de la Navbar globale. L'authentification est fournie à
 * la racine (`AppAuthGate`).
 */
export const Route = createFileRoute('/rapro')({
  component: RaproLayout,
  ssr: false,
  head: () => ({ meta: [{ title: 'Rapprochement — Back Office' }] }),
})

function RaproLayout() {
  return <Outlet />
}

import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * Layout de l'onglet `/caisse`.
 *
 * `ssr: false` : la sous-page `/caisse/analytique` monte des graphiques recharts
 * (100 % navigateur). Comme pour `/pdj`, on désactive le SSR sur tout l'îlot.
 *
 * La « Caisse » est le board principal (`/caisse/`), l'accès à l'« Analytique »
 * se fait par un bouton dans l'en-tête du board, retour par le lien « Caisse »
 * de la Navbar globale. L'authentification est fournie à la racine (`AppAuthGate`).
 */
export const Route = createFileRoute('/caisse')({
  component: CaisseLayout,
  ssr: false,
  head: () => ({ meta: [{ title: 'Caisse — Back Office' }] }),
})

function CaisseLayout() {
  return <Outlet />
}

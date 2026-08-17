import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * Layout de l'onglet `/literie`.
 *
 * Page UNIQUE (pas de sous-route) : la grille literie synthétique + stock ET
 * le planning des lits parapluie bébé vivent tous les deux dans le board
 * principal (`/literie/`, `LiterieBoard`), l'un sous l'autre — décision
 * explicite de l'utilisateur (pas de bascule entre deux vues). L'authentification
 * est fournie à la racine (`AppAuthGate`).
 */
export const Route = createFileRoute('/literie')({
  component: LiterieLayout,
  head: () => ({ meta: [{ title: 'Literie — Back Office' }] }),
})

function LiterieLayout() {
  return <Outlet />
}

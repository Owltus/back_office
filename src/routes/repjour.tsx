import { Outlet, createFileRoute } from '@tanstack/react-router'

import { RepjourNav } from '#/components/repjour/RepjourNav.tsx'

/**
 * Layout de l'onglet `/repjour`.
 *
 * `ssr: false` : cet onglet monte des briques 100 % navigateur (graphiques
 * recharts, et html2canvas aux étapes suivantes). Le rendre sans SSR évite tout
 * crash de rendu serveur.
 *
 * L'authentification est fournie plus haut, à la racine (`AuthProvider` dans
 * `__root.tsx`) : elle protège toute l'application. Ce layout n'apporte donc que
 * la sous-navigation d'onglet (`RepjourNav`) et l'`Outlet`. Le gating par RÔLE
 * des sous-pages reste assuré par `ProtectedRoute`.
 */
export const Route = createFileRoute('/repjour')({
  component: RepjourLayout,
  ssr: false,
  head: () => ({ meta: [{ title: 'RepJour — Back Office' }] }),
})

function RepjourLayout() {
  return (
    <>
      <RepjourNav />
      <Outlet />
    </>
  )
}

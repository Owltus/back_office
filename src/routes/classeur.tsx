import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * Layout de l'onglet `/classeur`.
 *
 * Page VIDE pour l'instant (2026-09-25) : seul le câblage est en place —
 * clé `classeur` dans le registre `PAGES`, droits par page (CHECK de
 * `user_page_permissions.page` et de `profiles.page_order`, script
 * `supabase/page_classeur_2026-09-25.sql`), garde `PageGuard`. Le contenu
 * viendra dans un chantier séparé. L'authentification est fournie à la
 * racine (`AppAuthGate`).
 */
export const Route = createFileRoute('/classeur')({
  component: ClasseurLayout,
  head: () => ({ meta: [{ title: 'Classeur — Back Office' }] }),
})

function ClasseurLayout() {
  return <Outlet />
}

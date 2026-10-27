import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * Layout de l'onglet `/planning` : planning du staff de l'hôtel (portage du
 * prototype, plan `plan/planning-portage-2026-10-27/`). Le planning (semaine
 * ou mois) est l'écran par défaut ; les paramètres (équipe, postes, horaires
 * et absences, besoins) sont des sous-routes.
 *
 * `ssr: false` : la génération charge HiGHS (WebAssembly) dans un worker,
 * 100 % navigateur. L'authentification est fournie à la racine.
 */
export const Route = createFileRoute('/planning')({
  component: PlanningLayout,
  ssr: false,
  head: () => ({ meta: [{ title: 'Planning — Back Office' }] }),
})

function PlanningLayout() {
  return <Outlet />
}

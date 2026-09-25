import { Navigate, Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/classeur/$classeurId/$chapterId')({
  component: ChapterLayout,
})

/**
 * Layout d'un chapitre : `Outlet` vers la page du chapitre (`index.tsx`) et
 * les quatre pages de détail (`document.$id`, `suivi.$id`, `signature.$id`,
 * `intercalaire.$id`). Garde et colonne des chapitres viennent du layout
 * parent. Identifiant de chapitre invalide : retour au tableau de bord du
 * classeur.
 */
function ChapterLayout() {
  const { classeurId, chapterId } = Route.useParams()
  const id = Number(chapterId)
  if (!Number.isInteger(id) || id <= 0) {
    return (
      <Navigate to="/classeur/$classeurId" params={{ classeurId }} replace />
    )
  }
  return <Outlet />
}

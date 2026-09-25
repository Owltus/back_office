import { createFileRoute } from '@tanstack/react-router'

import { ChapterBoard } from '#/components/classeur/ChapterBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/classeur/$classeurId/$chapterId/')({
  component: ChapterPage,
})

/**
 * Page d'un chapitre (éléments). Garde `PageGuard` et conversion des
 * identifiants faites par les layouts parents. `key={chapterId}` remonte le
 * board à chaque changement de chapitre : sélection, recherche et dialogues
 * repartent de zéro.
 */
function ChapterPage() {
  const { classeurId, chapterId } = Route.useParams()
  return (
    <PageContainer>
      <ChapterBoard
        key={chapterId}
        classeurId={Number(classeurId)}
        chapterId={Number(chapterId)}
      />
    </PageContainer>
  )
}

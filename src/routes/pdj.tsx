import { createFileRoute } from '@tanstack/react-router'

import { BreakfastBoard } from '#/components/pdj/BreakfastBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/pdj')({
  component: PdjPage,
  head: () => ({ meta: [{ title: 'PDJ — Back Office' }] }),
})

function PdjPage() {
  return (
    <PageContainer printBleed>
      <BreakfastBoard />
    </PageContainer>
  )
}

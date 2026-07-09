import { createFileRoute } from '@tanstack/react-router'

import { AffichageBoard } from '#/components/affiche/AffichageBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/affichage')({
  component: AffichagePage,
  head: () => ({
    meta: [{ title: 'Affichage — Back Office' }],
    // Poppins n'habille que l'affiche A3 (styles/poster.css). La charger ici
    // plutôt que globalement évite trois fichiers de police sur chaque page.
    links: [
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&display=swap',
      },
    ],
  }),
})

function AffichagePage() {
  return (
    <PageContainer printBleed fillHeight>
      <AffichageBoard />
    </PageContainer>
  )
}

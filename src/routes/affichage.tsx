import { createFileRoute } from '@tanstack/react-router'

// Poppins n'habille que l'affiche A3 (styles/poster.css). Auto-hébergée depuis
// le 2026-09-20, et importée ICI plutôt que dans styles.css : l'import atterrit
// dans le chunk de cette route, donc les trois graisses ne pèsent sur aucune
// autre page. Ne pas remonter ces lignes dans styles.css.
import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-800.css'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { AffichageBoard } from '#/components/affiche/AffichageBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/affichage')({
  component: AffichagePage,
  head: () => ({
    meta: [{ title: 'Affichage — Back Office' }],
  }),
})

function AffichagePage() {
  return (
    <PageGuard page="affichage">
      <PageContainer printBleed fillHeight>
        <AffichageBoard />
      </PageContainer>
    </PageGuard>
  )
}

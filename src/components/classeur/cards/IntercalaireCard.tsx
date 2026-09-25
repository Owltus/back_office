import { Bookmark } from 'lucide-react'

import { ItemCardShell } from '#/components/classeur/cards/ItemCardShell.tsx'
import type { ItemCardCommonProps } from '#/components/classeur/cards/ItemCardShell.tsx'
import { IntercalaireSheet } from '#/components/classeur/print/IntercalaireSheet.tsx'
import { titreOuDefaut } from '#/lib/classeur/sommaire.ts'
import type { DbIntercalaire } from '#/lib/classeur/types.ts'

/** Carte d'un intercalaire : miniature de la page de séparation. */
export function IntercalaireCard({
  page,
  ...commun
}: ItemCardCommonProps & { page: DbIntercalaire }) {
  return (
    <ItemCardShell
      kind="intercalaire"
      id={page.id}
      title={page.title}
      icon={Bookmark}
      {...commun}
    >
      <IntercalaireSheet
        title={titreOuDefaut(page.title)}
        description={page.description}
        chapterName={commun.chapterName}
        classeurName={commun.classeurName}
        establishment={commun.establishment}
      />
    </ItemCardShell>
  )
}

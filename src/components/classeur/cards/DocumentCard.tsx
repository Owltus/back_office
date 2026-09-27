import { FileText } from 'lucide-react'

import { ItemCardShell } from '#/components/classeur/cards/ItemCardShell.tsx'
import type { ItemCardCommonProps } from '#/components/classeur/cards/ItemCardShell.tsx'
import { DocumentPages } from '#/components/classeur/print/DocumentPages.tsx'
import { exporterDocumentMarkdown } from '#/lib/classeur/exportMarkdown.ts'
import { titreOuDefaut } from '#/lib/classeur/sommaire.ts'
import type { DbDocument } from '#/lib/classeur/types.ts'
import { mentionVersion } from '#/lib/classeur/print/mentionVersion.ts'

/** Carte d'un document Markdown : miniature de sa première page A4. */
export function DocumentCard({
  doc,
  ...commun
}: ItemCardCommonProps & { doc: DbDocument }) {
  return (
    <ItemCardShell
      kind="document"
      id={doc.id}
      title={doc.title}
      icon={FileText}
      onExportMarkdown={() => exporterDocumentMarkdown(doc.title, doc.content)}
      {...commun}
    >
      <DocumentPages
        title={titreOuDefaut(doc.title)}
        subtitle={doc.description}
        content={doc.content}
        mention={mentionVersion(doc.updated_at)}
        chapterName={commun.chapterName}
        classeurName={commun.classeurName}
        establishment={commun.establishment}
      />
    </ItemCardShell>
  )
}

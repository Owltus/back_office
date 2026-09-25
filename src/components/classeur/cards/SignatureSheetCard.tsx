import { PenLine } from 'lucide-react'

import { ItemCardShell } from '#/components/classeur/cards/ItemCardShell.tsx'
import type { ItemCardCommonProps } from '#/components/classeur/cards/ItemCardShell.tsx'
import { SignatureSheetPage } from '#/components/classeur/print/SignatureSheetPage.tsx'
import { titreOuDefaut } from '#/lib/classeur/sommaire.ts'
import type { DbSignatureSheet } from '#/lib/classeur/types.ts'

/** Carte d'une feuille de signature : miniature du tableau d'émargement. */
export function SignatureSheetCard({
  sheet,
  ...commun
}: ItemCardCommonProps & { sheet: DbSignatureSheet }) {
  return (
    <ItemCardShell
      kind="signature_sheet"
      id={sheet.id}
      title={sheet.title}
      icon={PenLine}
      {...commun}
    >
      <SignatureSheetPage
        title={titreOuDefaut(sheet.title)}
        subtitle={sheet.description}
        nombre={sheet.nombre}
        chapterName={commun.chapterName}
        classeurName={commun.classeurName}
        establishment={commun.establishment}
      />
    </ItemCardShell>
  )
}

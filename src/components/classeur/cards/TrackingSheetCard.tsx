import { Table2 } from 'lucide-react'

import { ItemCardShell } from '#/components/classeur/cards/ItemCardShell.tsx'
import type { ItemCardCommonProps } from '#/components/classeur/cards/ItemCardShell.tsx'
import { TrackingSheetPage } from '#/components/classeur/print/TrackingSheetPage.tsx'
import { titreOuDefaut } from '#/lib/classeur/sommaire.ts'
import type { DbPeriodicite, DbTrackingSheet } from '#/lib/classeur/types.ts'

/** Nombre de lignes quand la périodicité est inconnue (comme Registre). */
export const LIGNES_SUIVI_REPLI = 8

/** Carte d'une feuille de suivi : miniature du tableau Date | Note | Signature. */
export function TrackingSheetCard({
  sheet,
  periodicite,
  ...commun
}: ItemCardCommonProps & {
  sheet: DbTrackingSheet
  periodicite: DbPeriodicite | undefined
}) {
  return (
    <ItemCardShell
      kind="tracking_sheet"
      id={sheet.id}
      title={sheet.title}
      icon={Table2}
      {...commun}
    >
      <TrackingSheetPage
        title={titreOuDefaut(sheet.title)}
        periodiciteLabel={periodicite?.label ?? ''}
        nombre={periodicite?.nombre ?? LIGNES_SUIVI_REPLI}
        chapterName={commun.chapterName}
        classeurName={commun.classeurName}
        establishment={commun.establishment}
      />
    </ItemCardShell>
  )
}

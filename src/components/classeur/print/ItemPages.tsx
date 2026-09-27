import { CoverPage } from '#/components/classeur/print/CoverPage.tsx'
import { DocumentPages } from '#/components/classeur/print/DocumentPages.tsx'
import { IntercalaireSheet } from '#/components/classeur/print/IntercalaireSheet.tsx'
import { SignatureSheetPage } from '#/components/classeur/print/SignatureSheetPage.tsx'
import { TrackingSheetPage } from '#/components/classeur/print/TrackingSheetPage.tsx'
import { cleRef } from '#/lib/classeur/ordre.ts'
import { mentionVersion } from '#/lib/classeur/print/mentionVersion.ts'
import { titreOuDefaut } from '#/lib/classeur/sommaire.ts'
import { flattenItems } from '#/lib/classeur/types.ts'
import type {
  ChapterContent,
  ChapterItem,
  DbChapter,
  DbPeriodicite,
} from '#/lib/classeur/types.ts'

/** Nombre de lignes d'une feuille de suivi dont la périodicité est inconnue. */
const LIGNES_SUIVI_REPLI = 8

export interface PagesContexte {
  chapterName?: string
  classeurName?: string
  establishment?: string
  periodicites: ReadonlyArray<DbPeriodicite>
}

/**
 * Les pages A4 d'UN élément, selon sa nature — le `switch` que Registre
 * répétait dans `ChapterPage` (aperçu d'un élément, « tout imprimer ») et
 * `DashboardPage` (classeur complet). Une seule source ici.
 */
export function ItemPages({
  item,
  chapterName,
  classeurName,
  establishment,
  periodicites,
}: PagesContexte & { item: ChapterItem }) {
  const commun = { chapterName, classeurName, establishment }
  switch (item.kind) {
    case 'document':
      return (
        <DocumentPages
          title={titreOuDefaut(item.data.title)}
          subtitle={item.data.description}
          content={item.data.content}
          mention={mentionVersion(item.data.updated_at)}
          {...commun}
        />
      )
    case 'tracking_sheet': {
      const p = periodicites.find((x) => x.id === item.data.periodicite_id)
      return (
        <TrackingSheetPage
          title={titreOuDefaut(item.data.title)}
          periodiciteLabel={p?.label ?? ''}
          nombre={p?.nombre ?? LIGNES_SUIVI_REPLI}
          {...commun}
        />
      )
    }
    case 'signature_sheet':
      return (
        <SignatureSheetPage
          title={titreOuDefaut(item.data.title)}
          subtitle={item.data.description}
          nombre={item.data.nombre}
          {...commun}
        />
      )
    case 'intercalaire':
      return (
        <IntercalaireSheet
          title={titreOuDefaut(item.data.title)}
          description={item.data.description}
          {...commun}
        />
      )
  }
}

/**
 * Un chapitre entier : page de garde puis les pages de chaque élément dans
 * l'ordre d'affichage. `content` ne doit contenir QUE ce chapitre
 * (`contenuDuChapitre` côté tableau de bord).
 */
export function ChapterPrintPages({
  chapter,
  content,
  classeurName,
  establishment,
  periodicites,
}: Omit<PagesContexte, 'chapterName'> & {
  chapter: DbChapter
  content: ChapterContent
}) {
  return (
    <>
      <CoverPage
        chapterLabel={chapter.label}
        chapterDescription={chapter.description || undefined}
        chapterIcon={chapter.icon}
        classeurName={classeurName}
      />
      {flattenItems(content).map((item) => (
        <ItemPages
          key={cleRef(item.kind, item.data.id)}
          item={item}
          chapterName={chapter.label}
          classeurName={classeurName}
          establishment={establishment}
          periodicites={periodicites}
        />
      ))}
    </>
  )
}

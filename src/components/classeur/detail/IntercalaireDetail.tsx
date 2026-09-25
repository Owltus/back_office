import { useState } from 'react'

import {
  DetailActions,
  DetailErreur,
  DetailFields,
  DetailHeader,
  DetailIntrouvable,
  DetailSkeleton,
  PageFitViewport,
} from '#/components/classeur/detail/DetailFrame.tsx'
import { useDetailPage } from '#/components/classeur/hooks/useDetailPage.ts'
import { IntercalaireSheet } from '#/components/classeur/print/IntercalaireSheet.tsx'
import { PrintPreview } from '#/components/classeur/print/PrintPreview.tsx'
import { Input } from '#/components/ui/input.tsx'
import { SANS_TITRE, titreOuDefaut } from '#/lib/classeur/sommaire.ts'

/**
 * Page d'un intercalaire — portée de Registre (`IntercalaireDetail`) : la
 * page A4 à l'échelle ; en édition, titre et description dans une carte
 * sous l'en-tête, l'aperçu suit la saisie.
 */
export function IntercalaireDetail() {
  const page = useDetailPage('intercalaire')
  const inter = page.item
  const retour = page.backParams

  const [editing, setEditing] = useState(false)
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)

  const commencerEdition = () => {
    if (!inter) return
    setTitre(inter.title)
    setDescription(inter.description)
    page.update.reset()
    setEditing(true)
  }

  const sauvegarder = async () => {
    if (!inter || page.update.isPending) return
    try {
      await page.update.mutateAsync({
        title: titre.trim() || SANS_TITRE,
        description: description.trim(),
      })
      setEditing(false)
    } catch {
      // Affichée par `page.update.error`.
    }
  }

  if (page.isPending) return <DetailSkeleton retour={retour} />
  if (page.isError) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <DetailHeader retour={retour} title={null} />
        <DetailErreur err={page.error} action="Intercalaire indisponible" />
      </div>
    )
  }
  if (!inter) {
    return (
      <DetailIntrouvable
        label="Cet intercalaire n'existe plus."
        retour={retour}
      />
    )
  }

  const titreAffiche = editing
    ? titreOuDefaut(titre)
    : titreOuDefaut(inter.title)

  return (
    <div className="flex flex-1 flex-col gap-4">
      <DetailHeader
        retour={retour}
        title={titreAffiche}
        kind="intercalaire"
        chapterName={page.chapter?.label}
        actions={
          <DetailActions
            editing={editing}
            canWrite={page.canWrite}
            saving={page.update.isPending}
            onEdit={commencerEdition}
            onCancel={() => {
              setEditing(false)
              page.update.reset()
            }}
            onSave={() => void sauvegarder()}
            onPrint={() => setPreviewOpen(true)}
          />
        }
      />

      {editing && (
        <DetailFields>
          <Input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Titre de l'intercalaire"
            aria-label="Titre de l'intercalaire"
            className="font-medium sm:flex-1"
            maxLength={200}
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            aria-label="Description"
            className="sm:w-64"
            maxLength={1000}
          />
        </DetailFields>
      )}

      {page.update.isError && (
        <DetailErreur err={page.update.error} action="Sauvegarde impossible" />
      )}

      <PageFitViewport>
        <IntercalaireSheet
          title={titreAffiche}
          description={editing ? description : inter.description}
          chapterName={page.chapter?.label}
          classeurName={page.classeurName}
          establishment={page.establishment}
        />
      </PageFitViewport>

      <PrintPreview
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={titreOuDefaut(inter.title)}
      >
        <IntercalaireSheet
          title={titreOuDefaut(inter.title)}
          description={inter.description}
          chapterName={page.chapter?.label}
          classeurName={page.classeurName}
          establishment={page.establishment}
        />
      </PrintPreview>
    </div>
  )
}

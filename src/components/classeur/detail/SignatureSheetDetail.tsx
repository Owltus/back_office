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
import { PrintPreview } from '#/components/classeur/print/PrintPreview.tsx'
import { SignatureSheetPage } from '#/components/classeur/print/SignatureSheetPage.tsx'
import { Input } from '#/components/ui/input.tsx'
import { SANS_TITRE, titreOuDefaut } from '#/lib/classeur/sommaire.ts'

/** Bornes du nombre de lignes de signature (CHECK en base : 1..60). */
const LIGNES_MIN = 1
const LIGNES_MAX = 60

/**
 * Page d'une feuille de signature — portée de Registre
 * (`SignatureSheetDetail`) : la page A4 à l'échelle ; en édition, titre,
 * description et nombre de lignes dans une carte sous l'en-tête (Registre
 * ne permettait pas de changer le nombre de lignes : ajout).
 */
export function SignatureSheetDetail() {
  const page = useDetailPage('signature_sheet')
  const sheet = page.item
  const retour = page.backParams

  const [editing, setEditing] = useState(false)
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [nombre, setNombre] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)

  const commencerEdition = () => {
    if (!sheet) return
    setTitre(sheet.title)
    setDescription(sheet.description)
    setNombre(String(sheet.nombre))
    page.update.reset()
    setEditing(true)
  }

  const nombreValide = (() => {
    const n = Number(nombre)
    return Number.isInteger(n) && n >= LIGNES_MIN && n <= LIGNES_MAX ? n : null
  })()

  const sauvegarder = async () => {
    if (!sheet || page.update.isPending || nombreValide === null) return
    try {
      await page.update.mutateAsync({
        title: titre.trim() || SANS_TITRE,
        description: description.trim(),
        nombre: nombreValide,
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
        <DetailErreur
          err={page.error}
          action="Feuille de signature indisponible"
        />
      </div>
    )
  }
  if (!sheet) {
    return (
      <DetailIntrouvable
        label="Cette feuille de signature n'existe plus."
        retour={retour}
      />
    )
  }

  const titreAffiche = editing
    ? titreOuDefaut(titre)
    : titreOuDefaut(sheet.title)

  return (
    <div className="flex flex-1 flex-col gap-4">
      <DetailHeader
        retour={retour}
        title={titreAffiche}
        kind="signature_sheet"
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
            placeholder="Titre de la feuille"
            aria-label="Titre de la feuille de signature"
            className="font-medium sm:flex-1"
            maxLength={200}
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            aria-label="Description"
            className="sm:w-56"
            maxLength={1000}
          />
          <Input
            type="number"
            inputMode="numeric"
            min={LIGNES_MIN}
            max={LIGNES_MAX}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            aria-label="Nombre de lignes"
            aria-invalid={nombreValide === null}
            className="sm:w-24"
          />
        </DetailFields>
      )}

      {editing && nombreValide === null && (
        <p className="text-xs text-destructive">
          Nombre de lignes entre {LIGNES_MIN} et {LIGNES_MAX}.
        </p>
      )}
      {page.update.isError && (
        <DetailErreur err={page.update.error} action="Sauvegarde impossible" />
      )}

      <PageFitViewport>
        <SignatureSheetPage
          title={titreAffiche}
          subtitle={editing ? description : sheet.description}
          nombre={editing ? (nombreValide ?? sheet.nombre) : sheet.nombre}
          chapterName={page.chapter?.label}
          classeurName={page.classeurName}
          establishment={page.establishment}
        />
      </PageFitViewport>

      <PrintPreview
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={titreOuDefaut(sheet.title)}
      >
        <SignatureSheetPage
          title={titreOuDefaut(sheet.title)}
          subtitle={sheet.description}
          nombre={sheet.nombre}
          chapterName={page.chapter?.label}
          classeurName={page.classeurName}
          establishment={page.establishment}
        />
      </PrintPreview>
    </div>
  )
}

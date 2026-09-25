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
import { usePeriodicites } from '#/components/classeur/hooks/useClasseur.ts'
import { PrintPreview } from '#/components/classeur/print/PrintPreview.tsx'
import { TrackingSheetPage } from '#/components/classeur/print/TrackingSheetPage.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { SANS_TITRE, titreOuDefaut } from '#/lib/classeur/sommaire.ts'

/** Nombre de lignes quand la périodicité est inconnue (comme Registre). */
const LIGNES_REPLI = 8

/**
 * Page d'une feuille de suivi — portée de Registre (`TrackingSheetDetail`) :
 * la page A4 à l'échelle ; en édition, titre et périodicité dans une carte
 * sous l'en-tête, l'aperçu suit la saisie.
 */
export function TrackingSheetDetail() {
  const page = useDetailPage('tracking_sheet')
  const sheet = page.item
  const retour = page.backParams
  const periodicites = usePeriodicites()

  const [editing, setEditing] = useState(false)
  const [titre, setTitre] = useState('')
  const [periodiciteId, setPeriodiciteId] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)

  const commencerEdition = () => {
    if (!sheet) return
    setTitre(sheet.title)
    setPeriodiciteId(String(sheet.periodicite_id))
    page.update.reset()
    setEditing(true)
  }

  const sauvegarder = async () => {
    if (!sheet || page.update.isPending) return
    const p = Number(periodiciteId)
    if (!p) return
    try {
      await page.update.mutateAsync({
        title: titre.trim() || SANS_TITRE,
        periodicite_id: p,
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
        <DetailErreur err={page.error} action="Feuille de suivi indisponible" />
      </div>
    )
  }
  if (!sheet) {
    return (
      <DetailIntrouvable
        label="Cette feuille de suivi n'existe plus."
        retour={retour}
      />
    )
  }

  const liste = periodicites.data ?? []
  const idAffiche = editing ? Number(periodiciteId) : sheet.periodicite_id
  const perio = liste.find((p) => p.id === idAffiche)
  const perioEnregistree = liste.find((p) => p.id === sheet.periodicite_id)
  const titreAffiche = editing
    ? titreOuDefaut(titre)
    : titreOuDefaut(sheet.title)

  return (
    <div className="flex flex-1 flex-col gap-4">
      <DetailHeader
        retour={retour}
        title={titreAffiche}
        kind="tracking_sheet"
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
            aria-label="Titre de la feuille de suivi"
            className="font-medium sm:flex-1"
            maxLength={200}
          />
          <Select value={periodiciteId} onValueChange={setPeriodiciteId}>
            <SelectTrigger className="sm:w-48" aria-label="Périodicité">
              <SelectValue placeholder="Périodicité" />
            </SelectTrigger>
            <SelectContent>
              {liste.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DetailFields>
      )}

      {page.update.isError && (
        <DetailErreur err={page.update.error} action="Sauvegarde impossible" />
      )}
      {periodicites.isError && (
        <DetailErreur
          err={periodicites.error}
          action="Périodicités indisponibles"
        />
      )}

      <PageFitViewport>
        <TrackingSheetPage
          title={titreAffiche}
          periodiciteLabel={perio?.label ?? ''}
          nombre={perio?.nombre ?? LIGNES_REPLI}
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
        <TrackingSheetPage
          title={titreOuDefaut(sheet.title)}
          periodiciteLabel={perioEnregistree?.label ?? ''}
          nombre={perioEnregistree?.nombre ?? LIGNES_REPLI}
          chapterName={page.chapter?.label}
          classeurName={page.classeurName}
          establishment={page.establishment}
        />
      </PrintPreview>
    </div>
  )
}

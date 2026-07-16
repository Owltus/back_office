import { useRef, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import {
  AlertTriangle,
  FileText,
  FileUp,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { InvoiceList } from '#/components/facturation/InvoiceList.tsx'
import { InvoicePanel } from '#/components/facturation/InvoicePanel.tsx'
import { StampPreview } from '#/components/facturation/StampPreview.tsx'
import { detect } from '#/lib/facturation/detect.ts'
import { budgetLabel } from '#/lib/facturation/constants.ts'
import {
  addInvoices,
  clearFacturation,
  facturationStore,
  patchInvoice,
  removeInvoice,
  selectInvoice,
} from '#/lib/facturationStore.ts'
import type { InvoiceRecord, StampData } from '#/lib/facturation/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Prototype « Facturation » — page de TEST, réservée aux admins, SANS base de
 * données. Charpente calquée sur la page Affichage : trois panneaux en carte
 * TOUJOURS visibles (file des factures à gauche, grand aperçu au centre,
 * imputation à droite), sans barre d'en-tête.
 *
 * L'état (factures + sélection) vit dans un STORE module-level (facturationStore) :
 * il survit à la navigation (on peut quitter la page et revenir sans rien perdre).
 * En mémoire de session — un rechargement complet repart de zéro. Le bouton
 * « Tout effacer » clôt la session.
 *
 * On lit le PDF (texte natif pdf.js, ou OCR Tesseract si c'est un scan), on en
 * déduit un code comptable par règles déterministes, puis on appose un tampon
 * vectoriel (pdf-lib) là où on l'a posé et à la taille choisie. Rien n'est envoyé
 * au réseau applicatif ; seules les « règles apprises » vivent dans localStorage.
 * Les libs lourdes sont chargées par import() dynamique.
 */

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function stampDataOf(record: InvoiceRecord): StampData {
  return {
    code: record.code,
    label: budgetLabel(record.code),
    comment: record.comment,
    invoiceDate: record.invoiceDate,
    processedDate: record.processedDate,
    scale: record.stampScale,
  }
}

/** Lecture d'un PDF puis mise à jour du store (continue même après démontage). */
async function processInvoice(record: InvoiceRecord) {
  try {
    // pdf.js (+ Tesseract au besoin) chargés seulement maintenant.
    const { extractPdf } = await import('#/lib/facturation/extract.ts')
    const res = await extractPdf(record.file)
    const d = detect(res.text)
    patchInvoice(record.id, {
      status: 'ready',
      method: res.method,
      pageCount: res.pageCount,
      text: res.text,
      detection: d,
      previews: res.previews,
      code: d.code ?? '',
      supplierName: d.supplier ?? '',
      invoiceDate: d.hints.date ?? '',
    })
  } catch (e) {
    patchInvoice(record.id, {
      status: 'error',
      error: e instanceof Error ? e.message : 'Lecture impossible',
    })
  }
}

/** Ce qui s'affiche au centre selon l'état de la facture sélectionnée. */
function CenterPlaceholder({ record }: { record: InvoiceRecord | null }) {
  if (!record) {
    return (
      <div className="m-auto flex flex-col items-center gap-2 text-muted-foreground">
        <FileText className="size-8 opacity-60" />
        <p className="text-sm">Déposez une facture pour commencer.</p>
      </div>
    )
  }
  if (record.status === 'error') {
    return (
      <div className="m-auto flex flex-col items-center gap-2 text-destructive">
        <AlertTriangle className="size-8" />
        <p className="text-sm">{record.error}</p>
      </div>
    )
  }
  return (
    <div className="m-auto flex flex-col items-center gap-2 text-muted-foreground">
      <Loader2 className="size-8 animate-spin" />
      <p className="text-sm">Lecture de la facture…</p>
    </div>
  )
}

export function FacturationBoard() {
  const { records, selectedId } = useStore(facturationStore)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(files: FileList | File[]) {
    const pdfs = Array.from(files).filter(
      (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
    )
    if (!pdfs.length) return
    const created: InvoiceRecord[] = pdfs.map((file) => ({
      id: crypto.randomUUID(),
      file,
      fileName: file.name,
      status: 'processing',
      method: null,
      pageCount: 0,
      text: '',
      detection: null,
      previews: [],
      position: null,
      stampScale: 1,
      code: '',
      supplierName: '',
      comment: '',
      invoiceDate: '',
      processedDate: todayIso(),
      error: null,
    }))
    addInvoices(created)
    created.forEach(processInvoice)
  }

  const openPicker = () => inputRef.current?.click()

  // Dépôt : toute la colonne gauche est une cible (surlignée au survol).
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDragging(false)
    }
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const selected = records.find((r) => r.id === selectedId) ?? null

  return (
    <PageContainer fillHeight>
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
        />

        {/* COLONNE GAUCHE : toute la carte est une cible de dépôt (surlignée au
            survol). À vide → grande invitation ; avec factures → les miniatures
            prennent le dessus et le dépôt reste dispo, discret. */}
        <aside
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            'flex min-h-0 w-full shrink-0 flex-col gap-3 rounded-xl border bg-card p-3 transition-colors lg:max-h-full lg:w-80',
            dragging ? 'border-primary ring-1 ring-primary' : 'border-border',
          )}
        >
          {records.length === 0 ? (
            <button
              type="button"
              onClick={openPicker}
              className={cn(
                'empty-canvas flex min-h-[240px] flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border p-6 text-center outline-none transition-colors lg:min-h-0',
                'hover:border-primary/60 hover:bg-secondary/30 focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <div className="rounded-full bg-secondary p-4">
                <FileUp className="size-8 text-muted-foreground" />
              </div>
              <div className="text-base font-medium">
                Glissez vos factures PDF ici
              </div>
              <div className="text-sm text-muted-foreground">
                un ou plusieurs .pdf — scan ou PDF natif, rien ne quitte votre
                navigateur
              </div>
            </button>
          ) : (
            <>
              <InvoiceList
                records={records}
                selectedId={selectedId}
                onSelect={selectInvoice}
                onRemove={removeInvoice}
                className="min-h-0 flex-1 flex-col overflow-y-auto"
              />
              <button
                type="button"
                onClick={openPicker}
                className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-dashed border-border p-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
              >
                <Plus className="size-4" />
                Ajouter des PDF
              </button>
              <button
                type="button"
                onClick={clearFacturation}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                <Trash2 className="size-4" />
                Tout effacer
              </button>
            </>
          )}
        </aside>

        {/* CENTRE : grand aperçu + tampon */}
        <section className="order-last flex min-h-[55vh] min-w-0 flex-1 flex-col lg:order-none lg:min-h-0">
          <div className="flex min-h-0 flex-1 rounded-xl border border-border bg-muted/30 p-3">
            {selected &&
            selected.status === 'ready' &&
            selected.previews.length > 0 ? (
              <StampPreview
                key={selected.id}
                previews={selected.previews}
                data={stampDataOf(selected)}
                position={selected.position}
                onPositionChange={(p) =>
                  patchInvoice(selected.id, { position: p })
                }
                onScaleChange={(sc) =>
                  patchInvoice(selected.id, { stampScale: sc })
                }
              />
            ) : (
              <CenterPlaceholder record={selected} />
            )}
          </div>
        </section>

        {/* COLONNE DROITE : imputation comptable */}
        <aside className="flex min-h-0 w-full shrink-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 lg:max-h-full lg:w-80 lg:overflow-y-auto">
          <h2 className="text-sm font-semibold text-foreground">
            Imputation comptable
          </h2>
          {selected ? (
            <InvoicePanel
              key={selected.id}
              record={selected}
              onPatch={(n) => patchInvoice(selected.id, n)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucune facture sélectionnée.
            </p>
          )}
        </aside>
      </div>
    </PageContainer>
  )
}

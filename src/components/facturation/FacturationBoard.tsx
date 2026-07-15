import { useCallback, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Plus, UploadCloud } from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Button } from '#/components/ui/button.tsx'
import { InvoiceList } from '#/components/facturation/InvoiceList.tsx'
import { InvoicePanel } from '#/components/facturation/InvoicePanel.tsx'
import { StampPreview } from '#/components/facturation/StampPreview.tsx'
import { detect } from '#/lib/facturation/detect.ts'
import { budgetLabel } from '#/lib/facturation/constants.ts'
import type {
  Detection,
  ExtractMethod,
  PagePreview,
  StampData,
  StampPosition,
} from '#/lib/facturation/types.ts'

/*
 * Prototype « Facturation » — page de TEST, réservée aux admins, SANS base de
 * données. Atelier en trois panneaux : file des factures (gauche), grand aperçu
 * de la page avec tampon déplaçable (centre), imputation comptable (droite).
 *
 * TOUTE la page est une zone de dépôt : glisser des PDF n'importe où les ajoute
 * (voile de survol). Le clic reste possible via le prompt de l'état vide et le
 * bouton « Ajouter » de l'en-tête. On lit le PDF (texte natif pdf.js, ou OCR
 * Tesseract si c'est un scan), on en déduit un code comptable par règles
 * déterministes, puis on appose un tampon vectoriel (pdf-lib) là où on l'a posé.
 * Rien n'est envoyé au réseau applicatif ; seules les « règles apprises » vivent
 * dans localStorage. Les libs lourdes sont chargées par import() dynamique.
 */

/** État d'une facture chargée : lecture en cours, prête, ou en erreur. */
export interface InvoiceRecord {
  id: string
  file: File
  fileName: string
  status: 'processing' | 'ready' | 'error'
  method: ExtractMethod | null
  pageCount: number
  text: string
  detection: Detection | null
  previews: PagePreview[]
  position: StampPosition | null
  code: string
  supplierName: string
  comment: string
  invoiceDate: string
  processedDate: string
  error: string | null
}

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
  }
}

/** Ce qui s'affiche au centre tant que la facture n'est pas prête. */
function CenterPlaceholder({ record }: { record: InvoiceRecord }) {
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
  const [records, setRecords] = useState<InvoiceRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const patch = useCallback((id: string, next: Partial<InvoiceRecord>) => {
    setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, ...next } : r)))
  }, [])

  const process = useCallback(
    async (record: InvoiceRecord) => {
      try {
        // pdf.js (+ Tesseract au besoin) chargés seulement maintenant.
        const { extractPdf } = await import('#/lib/facturation/extract.ts')
        const res = await extractPdf(record.file)
        const d = detect(res.text)
        patch(record.id, {
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
        patch(record.id, {
          status: 'error',
          error: e instanceof Error ? e.message : 'Lecture impossible',
        })
      }
    },
    [patch],
  )

  const addFiles = useCallback(
    (files: FileList | File[]) => {
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
        code: '',
        supplierName: '',
        comment: '',
        invoiceDate: '',
        processedDate: todayIso(),
        error: null,
      }))
      setRecords((rs) => [...created, ...rs])
      setSelectedId(created[0].id)
      created.forEach(process)
    },
    [process],
  )

  const removeRecord = useCallback((id: string) => {
    setRecords((rs) => {
      const next = rs.filter((r) => r.id !== id)
      setSelectedId((sel) => (sel === id ? (next[0]?.id ?? null) : sel))
      return next
    })
  }, [])

  const openPicker = () => inputRef.current?.click()

  // --- Dépôt au niveau de TOUTE la page --------------------------------------
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    // Ignore les passages d'un enfant à l'autre : on ne masque le voile que
    // lorsque le curseur quitte réellement la zone (relatedTarget hors du board).
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
  const hasRecords = records.length > 0

  return (
    <PageContainer fillHeight>
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
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

        <PageHeader
          title="Facturation"
          meta="Prototype — lecture PDF, imputation comptable et tampon, 100 % local"
          actions={
            hasRecords ? (
              <Button variant="outline" size="sm" onClick={openPicker}>
                <Plus className="size-4" />
                Ajouter
              </Button>
            ) : undefined
          }
        />

        {!hasRecords ? (
          <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
            <button
              type="button"
              onClick={openPicker}
              className="flex w-full max-w-xl flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/40 px-6 py-16 text-center transition-colors hover:border-primary/60 hover:bg-secondary/40"
            >
              <UploadCloud className="size-10 text-muted-foreground" />
              <span className="text-base font-medium text-foreground">
                Glissez vos factures PDF n'importe où, ou cliquez pour les
                choisir
              </span>
              <span className="text-xs text-muted-foreground">
                Plusieurs fichiers acceptés · scan ou PDF natif · rien ne quitte
                votre navigateur
              </span>
            </button>
          </div>
        ) : (
          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
            {/* Rail gauche : file des factures */}
            <InvoiceList
              records={records}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onRemove={removeRecord}
              className="shrink-0 overflow-x-auto pb-1 lg:w-52 lg:min-h-0 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pr-1"
            />

            {/* Centre : grand aperçu + tampon déplaçable */}
            <section className="flex min-h-[55vh] min-w-0 flex-1 flex-col lg:min-h-0">
              {selected && (
                <div className="flex min-h-0 flex-1 rounded-xl border border-border bg-muted/30 p-3">
                  {selected.status === 'ready' &&
                  selected.previews.length > 0 ? (
                    <StampPreview
                      key={selected.id}
                      previews={selected.previews}
                      data={stampDataOf(selected)}
                      position={selected.position}
                      onPositionChange={(p) =>
                        patch(selected.id, { position: p })
                      }
                    />
                  ) : (
                    <CenterPlaceholder record={selected} />
                  )}
                </div>
              )}
            </section>

            {/* Rail droit : imputation comptable */}
            <aside className="w-full shrink-0 overflow-y-auto rounded-xl border border-border bg-card p-4 lg:max-h-full lg:w-80">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Imputation comptable
              </h2>
              {selected && (
                <InvoicePanel
                  key={selected.id}
                  record={selected}
                  onPatch={(n) => patch(selected.id, n)}
                />
              )}
            </aside>
          </div>
        )}

        {/* Voile de dépôt (couvre toute la page pendant le survol d'un fichier) */}
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-primary">
              <UploadCloud className="size-10" />
              <span className="text-base font-medium">
                Déposez vos factures PDF
              </span>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}

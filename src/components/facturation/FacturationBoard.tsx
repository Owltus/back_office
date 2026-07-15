import { useCallback, useRef, useState } from 'react'
import { AlertTriangle, FileText, FileUp, Loader2 } from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { InvoiceList } from '#/components/facturation/InvoiceList.tsx'
import { InvoicePanel } from '#/components/facturation/InvoicePanel.tsx'
import { StampPreview } from '#/components/facturation/StampPreview.tsx'
import { detect } from '#/lib/facturation/detect.ts'
import { budgetLabel } from '#/lib/facturation/constants.ts'
import { cn } from '#/lib/utils.ts'
import type {
  Detection,
  ExtractMethod,
  PagePreview,
  StampData,
  StampPosition,
} from '#/lib/facturation/types.ts'

/*
 * Prototype « Facturation » — page de TEST, réservée aux admins, SANS base de
 * données. Charpente calquée sur la page Affichage : trois panneaux en carte
 * TOUJOURS visibles (file des factures à gauche, grand aperçu au centre,
 * imputation à droite), sans barre d'en-tête.
 *
 * On lit le PDF (texte natif pdf.js, ou OCR Tesseract si c'est un scan), on en
 * déduit un code comptable par règles déterministes, puis on appose un tampon
 * vectoriel (pdf-lib) là où on l'a posé et à la taille choisie. Rien n'est envoyé
 * au réseau applicatif ; seules les « règles apprises » vivent dans localStorage.
 * Les libs lourdes sont chargées par import() dynamique.
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
  stampScale: number
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
    scale: record.stampScale,
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
        stampScale: 1,
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

  // Dépôt limité à la dropzone de la colonne gauche (style PDJ).
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

        {/* COLONNE GAUCHE : dropzone (style PDJ) + file des factures */}
        <aside className="flex min-h-0 w-full shrink-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 lg:max-h-full lg:w-80 lg:overflow-y-auto">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'empty-canvas flex shrink-0 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border p-6 text-center outline-none transition-colors',
              'hover:border-primary/60 hover:bg-secondary/30 focus-visible:ring-2 focus-visible:ring-ring',
              dragging && 'border-primary bg-secondary/40',
              records.length ? 'min-h-[130px]' : 'min-h-[260px]',
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
          </div>

          <InvoiceList
            records={records}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRemove={removeRecord}
            className="flex-col"
          />
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
                onPositionChange={(p) => patch(selected.id, { position: p })}
                onScaleChange={(sc) => patch(selected.id, { stampScale: sc })}
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
              onPatch={(n) => patch(selected.id, n)}
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

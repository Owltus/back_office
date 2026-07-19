import { useEffect, useMemo, useRef, useState } from 'react'
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
import {
  EmptyImputation,
  InvoicePanel,
} from '#/components/facturation/InvoicePanel.tsx'
import { StampPreview } from '#/components/facturation/StampPreview.tsx'
import { GalaxyCard } from '#/components/facturation/GalaxyCard.tsx'
import { useFacturationModel } from '#/components/facturation/useFacturationModel.ts'
import { detect, redetect, type IssuerHint } from '#/lib/facturation/detect.ts'
import {
  maturity,
  mergePools,
  seedPool,
  type WordPool,
} from '#/lib/facturation/wordpool.ts'
import { matchIssuer, type Issuer } from '#/lib/facturation/issuers.ts'
import {
  issuerMaturity,
  issuerPrior,
  type IssuerCodes,
} from '#/lib/facturation/issuerCodes.ts'
import {
  deniedCodes,
  type IssuerDenylist,
} from '#/lib/facturation/issuerDenylist.ts'
import { reviewQueue } from '#/lib/facturation/anomalies.ts'
import { stampDataOf } from '#/lib/facturation/stampLayout.ts'
import {
  addInvoices,
  clearFacturation,
  facturationStore,
  patchInvoice,
  removeInvoice,
  selectInvoice,
} from '#/lib/facturationStore.ts'
import type { InvoiceRecord } from '#/lib/facturation/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Prototype « Facturation » — page réservée aux admins. Données serveur : les
 * « nuages de mots » d'imputation (facturation_wordpool, agrégés) et le dictionnaire
 * des émetteurs connus (facturation_issuers) — ni PDF ni texte de facture stockés.
 * Charpente calquée sur la page Affichage : trois panneaux en carte
 * TOUJOURS visibles (file des factures à gauche, grand aperçu au centre,
 * imputation à droite), sans barre d'en-tête.
 *
 * L'état (factures + sélection) vit dans un STORE module-level (facturationStore) :
 * il survit à la navigation (on peut quitter la page et revenir sans rien perdre).
 * En mémoire de session — un rechargement complet repart de zéro. Le bouton
 * « Tout effacer » clôt la session.
 *
 * On lit le PDF (texte natif pdf.js, ou OCR Tesseract si c'est un scan), on en
 * déduit les imputations par DEUX couches (règles déterministes + nuages de mots),
 * puis on appose un tampon vectoriel (pdf-lib). Les nuages sont lus une fois
 * (TanStack Query) et fusionnés avec la graine client ; l'apprentissage se fait au
 * tamponnage. Les libs lourdes sont chargées par import() dynamique.
 */

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Indice émetteur pour la détection : reconnaît l'émetteur dans le texte, puis fournit son
 *  PRIOR (uniquement si le modèle est assez MÛR — filtre prudent) et sa DENYLIST (toujours,
 *  indépendante de la maturité : une interdiction s'applique dès qu'elle existe). Renvoie
 *  `undefined` si aucun signal (émetteur inconnu, ni prior fort ni interdiction). */
function issuerHintFor(
  text: string,
  issuers: Issuer[],
  model: IssuerCodes,
  denylist: IssuerDenylist,
): IssuerHint | undefined {
  const known = matchIssuer(text, issuers)
  if (!known) return undefined
  const deny = deniedCodes(denylist, known.name)
  const mat = issuerMaturity(model, known.name)
  if (!mat.strong && deny.size === 0) return undefined // aucun signal → mots seuls
  return {
    prior: mat.strong ? issuerPrior(model, known.name) : {},
    concentrated: mat.strong ? mat.concentrated : false,
    deny: deny.size ? deny : undefined,
  }
}

/** Lecture d'un PDF puis mise à jour du store (continue même après démontage).
 *  `pool` (graine + nuages serveur) et `issuerCodes` sont passés explicitement car cette
 *  fonction vit hors composant et ne peut pas lire le cache TanStack Query. */
async function processInvoice(
  record: InvoiceRecord,
  pool: WordPool,
  issuers: Issuer[],
  issuerCodes: IssuerCodes,
  issuerDenylist: IssuerDenylist,
) {
  try {
    // pdf.js (+ Tesseract au besoin) chargés seulement maintenant.
    const { extractPdf } = await import('#/lib/facturation/extract.ts')
    const res = await extractPdf(record.file)
    // Pré-remplissage de l'émetteur, par priorité : émetteur DÉJÀ appris présent
    // dans le texte > mot-clé d'une règle reconnue > vide (jamais deviné). Résolu AVANT
    // la détection pour en dériver le prior émetteur (filtre fort) et sa denylist.
    const known = matchIssuer(res.text, issuers)
    const d = detect(
      res.text,
      undefined,
      pool,
      issuerHintFor(res.text, issuers, issuerCodes, issuerDenylist),
    )
    patchInvoice(record.id, {
      status: 'ready',
      method: res.method,
      pageCount: res.pageCount,
      text: res.text,
      detection: d,
      previews: res.previews,
      codes: d.codes,
      supplierName:
        known?.display ?? (d.supplier ? (d.matchedKeyword ?? '') : ''),
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

  // Lectures Supabase (nuages appris + émetteurs), en cache et dégradation gracieuse
  // (voir useFacturationModel). Le pool de scoring fusionne la graine avec l'appris.
  const { serverPool, issuers, issuerCodes, issuerDenylist } =
    useFacturationModel()
  const pool = useMemo(() => mergePools(seedPool(), serverPool), [serverPool])

  // Maturité du modèle APPRIS (serveur) : quand la base est vide/pauvre, on prévient
  // et on tempère la confiance affichée (les suggestions restent indicatives).
  const model = useMemo(() => maturity(serverPool), [serverPool])
  const immature = model.level !== 'ok'

  // Anomalies détectées à la volée (outliers émetteur, codes confusables) → pastille sur
  // le bouton engrenage de l'émetteur, résolution dans le modal de revue (InvoicePanel).
  const anomalyCount = useMemo(
    () => reviewQueue(serverPool, issuerCodes).length,
    [serverPool, issuerCodes],
  )

  // Re-détection en séance : quand le modèle appris évolue (pool enrichi après un
  // tamponnage, ou denylist/co-occurrence modifiées par la curation), on ré-impute les
  // factures ouvertes NON tamponnées et NON éditées à la main, depuis leur texte déjà
  // lu (pas de ré-extraction PDF). On ne patche que si l'imputation change réellement
  // → pas de rendu en boucle. Deps = modèle appris uniquement (jamais `records`, dont
  // les changements ne doivent pas relancer la re-détection).
  useEffect(() => {
    for (const r of facturationStore.state.records) {
      if (r.status !== 'ready' || r.learned || r.userEdited || !r.text) continue
      const { detection, codes } = redetect(
        r.text,
        pool,
        issuerHintFor(r.text, issuers, issuerCodes, issuerDenylist),
      )
      const same =
        codes.length === r.codes.length &&
        codes.every((c, i) => c === r.codes[i])
      if (!same) patchInvoice(r.id, { detection, codes })
    }
  }, [pool, issuers, issuerCodes, issuerDenylist])

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
      codes: [],
      supplierName: '',
      learned: false,
      comment: '',
      invoiceDate: '',
      processedDate: todayIso(),
      error: null,
    }))
    addInvoices(created)
    created.forEach((r) =>
      processInvoice(r, pool, issuers, issuerCodes, issuerDenylist),
    )
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

  // Données du tampon mémoïsées : identité stable tant que ces champs ne changent
  // pas, pour que les useMemo de StampPreview tiennent pendant un glisser.
  const stampData = useMemo(
    () => (selected ? stampDataOf(selected) : null),
    [
      selected?.codes,
      selected?.comment,
      selected?.invoiceDate,
      selected?.processedDate,
      selected?.stampScale,
    ],
  )

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
                data={stampData!}
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

        {/* COLONNE DROITE : galaxie (prévisualisation) au-dessus de l'imputation. */}
        <div className="flex min-h-0 w-full shrink-0 flex-col gap-4 lg:max-h-full lg:w-80">
          {/* La galaxie montre les données APPRISES (serveur), pas la graine. */}
          <GalaxyCard pool={serverPool} />
          <aside className="flex min-h-0 flex-1 flex-col gap-4 rounded-xl border border-border bg-card p-4">
            <h2 className="shrink-0 text-sm font-semibold text-foreground">
              Imputation comptable
            </h2>
            {model.level === 'vide' && (
              <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Base d’apprentissage vide — les suggestions ne sont pas encore
                fiables. Tamponnez quelques factures pour l’alimenter.
              </p>
            )}
            {selected ? (
              <InvoicePanel
                key={selected.id}
                record={selected}
                onPatch={(n) => patchInvoice(selected.id, n)}
                immature={immature}
                issuers={issuers}
                anomalyCount={anomalyCount}
              />
            ) : (
              <EmptyImputation />
            )}
          </aside>
        </div>
      </div>
    </PageContainer>
  )
}

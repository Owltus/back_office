import { useEffect, useState } from 'react'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { CheckSquare, Printer, X } from 'lucide-react'

import { DocumentCard } from '#/components/classeur/cards/DocumentCard.tsx'
import { IntercalaireCard } from '#/components/classeur/cards/IntercalaireCard.tsx'
import type { ItemCardCommonProps } from '#/components/classeur/cards/ItemCardShell.tsx'
import { SignatureSheetCard } from '#/components/classeur/cards/SignatureSheetCard.tsx'
import { TrackingSheetCard } from '#/components/classeur/cards/TrackingSheetCard.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { cleRef } from '#/lib/classeur/ordre.ts'
import type {
  ChapterItem,
  DbChapter,
  DbPeriodicite,
} from '#/lib/classeur/types.ts'

/*
 * « Documents modifiés » (demande utilisateur du 2026-11-16) : avant
 * l'aperçu d'impression, les éléments à réimprimer sont montrés EN CARTES,
 * comme dans la page d'un chapitre (miniature de la première page),
 * rangés par chapitre. Tout imprimer est le geste par défaut ; Sélectionner
 * (ou la case d'une carte) permet d'en choisir quelques-uns. « Déjà à jour »
 * retient le tout sans imprimer.
 */

export interface GroupeModifies {
  chapitre: DbChapter
  items: ChapterItem[]
}

function nombre(n: number, mot: string): string {
  return `${String(n)} ${mot}${n > 1 ? 's' : ''}`
}

export function DocumentsModifiesDialog({
  open,
  onOpenChange,
  classeurId,
  classeurName,
  establishment,
  groupes,
  periodicites,
  onImprimer,
  onDejaAJour,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  classeurId: number
  classeurName?: string
  establishment?: string
  /** Les éléments modifiés, chapitre par chapitre, dans l'ordre. */
  groupes: GroupeModifies[]
  periodicites: DbPeriodicite[]
  /** Ouvre l'aperçu d'impression de ces éléments. */
  onImprimer: (items: ChapterItem[]) => void
  /** Retient le tout comme imprimé, sans imprimer. */
  onDejaAJour: () => void
}) {
  const [enSelection, setEnSelection] = useState(false)
  const [choisis, setChoisis] = useState<ReadonlySet<string>>(new Set())

  // Chaque ouverture repart de zéro.
  useEffect(() => {
    if (open) return
    setEnSelection(false)
    setChoisis(new Set())
  }, [open])

  const tous = groupes.flatMap((g) => g.items)
  const selectionActive = enSelection || choisis.size > 0
  const choisisDansLOrdre = tous.filter((it) =>
    choisis.has(cleRef(it.kind, it.data.id)),
  )

  function basculer(cle: string) {
    setChoisis((avant) => {
      const s = new Set(avant)
      if (s.has(cle)) s.delete(cle)
      else s.add(cle)
      return s
    })
  }

  function quitterSelection() {
    setEnSelection(false)
    setChoisis(new Set())
  }

  const toutChoisi = tous.length > 0 && choisis.size === tous.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92dvh] flex-col gap-4 sm:max-w-[min(96vw,1400px)]">
        <DialogHeader>
          <DialogTitle>Documents modifiés</DialogTitle>
          <DialogDescription>
            {tous.length === 0
              ? 'Tout est à jour depuis votre dernière impression.'
              : `${nombre(tous.length, 'élément')} à réimprimer depuis votre dernière impression sur ce poste.`}
          </DialogDescription>
        </DialogHeader>

        {/* Mêmes cartes que la page d'un chapitre, en lecture : ni glisser
            ni modification. Le contexte dnd-kit est requis par les cartes. */}
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <DndContext>
            <div className="flex flex-col gap-6">
              {groupes.map((g) => (
                <section
                  key={g.chapitre.id}
                  className="flex flex-col gap-2"
                  aria-label={g.chapitre.label}
                >
                  <h3 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {g.chapitre.label}
                  </h3>
                  <SortableContext
                    items={g.items.map((it) => cleRef(it.kind, it.data.id))}
                    disabled
                  >
                    <div
                      className="grid gap-4"
                      style={{
                        gridTemplateColumns:
                          'repeat(auto-fill, minmax(220px, 1fr))',
                      }}
                    >
                      {g.items.map((it) => {
                        const cle = cleRef(it.kind, it.data.id)
                        const props: ItemCardCommonProps = {
                          classeurId,
                          chapterId: g.chapitre.id,
                          chapterName: g.chapitre.label,
                          classeurName,
                          establishment,
                          canWrite: false,
                          sortableDisabled: true,
                          selectionMode: selectionActive,
                          isSelected: choisis.has(cle),
                          onToggleSelect: () => basculer(cle),
                          // Un clic sur une carte commence la sélection.
                          onOpen: () => {
                            setEnSelection(true)
                            basculer(cle)
                          },
                          onPrint: () => onImprimer([it]),
                        }
                        switch (it.kind) {
                          case 'document':
                            return (
                              <DocumentCard
                                key={cle}
                                doc={it.data}
                                {...props}
                              />
                            )
                          case 'tracking_sheet':
                            return (
                              <TrackingSheetCard
                                key={cle}
                                sheet={it.data}
                                periodicite={periodicites.find(
                                  (p) => p.id === it.data.periodicite_id,
                                )}
                                {...props}
                              />
                            )
                          case 'signature_sheet':
                            return (
                              <SignatureSheetCard
                                key={cle}
                                sheet={it.data}
                                {...props}
                              />
                            )
                          case 'intercalaire':
                            return (
                              <IntercalaireCard
                                key={cle}
                                page={it.data}
                                {...props}
                              />
                            )
                        }
                      })}
                    </div>
                  </SortableContext>
                </section>
              ))}
            </div>
          </DndContext>
        </div>

        <DialogFooter className="gap-2 sm:items-center sm:justify-between">
          {selectionActive ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground" role="status">
                  {nombre(choisis.size, 'élément')} sélectionné
                  {choisis.size > 1 ? 's' : ''}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setChoisis(
                      toutChoisi
                        ? new Set()
                        : new Set(
                            tous.map((it) => cleRef(it.kind, it.data.id)),
                          ),
                    )
                  }
                >
                  {toutChoisi ? 'Tout désélectionner' : 'Tout sélectionner'}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={quitterSelection}>
                  <X />
                  Annuler la sélection
                </Button>
                <Button
                  onClick={() => onImprimer(choisisDansLOrdre)}
                  disabled={choisis.size === 0}
                >
                  <Printer />
                  Imprimer la sélection
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={onDejaAJour}
                disabled={tous.length === 0}
              >
                Déjà à jour, ne pas imprimer
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEnSelection(true)}
                  disabled={tous.length === 0}
                >
                  <CheckSquare />
                  Sélectionner
                </Button>
                <Button
                  onClick={() => onImprimer(tous)}
                  disabled={tous.length === 0}
                >
                  <Printer />
                  Tout imprimer
                </Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

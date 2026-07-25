import { useMemo } from 'react'
import { History } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { useFacturationModel } from '#/components/facturation/useFacturationModel.ts'
import { budgetLabel } from '#/lib/facturation/budgetRegistry.ts'
import type { JournalEntry } from '#/lib/facturation/types.ts'

/*
 * Historique des factures apprises (LECTURE SEULE). Chaque tampon écrit une entrée au journal
 * (facturation_learned_docs) : empreinte du PDF, clé émetteur, couples (code + compte) et date.
 * On regroupe par émetteur, entrées les plus récentes d'abord. Aucune action destructive ici :
 * la correction / le désapprentissage se font depuis « Contrôle des imputations ». Ouvert depuis
 * l'atelier. Les libellés se dérivent du référentiel courant (budgetLabel).
 */

export function HistoriqueDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { journal, issuers } = useFacturationModel()

  // Clé émetteur -> nom lisible (le journal ne stocke que la clé canonique).
  const displayOf = useMemo(() => {
    const m = new Map(issuers.map((i) => [i.name, i.display]))
    return (key: string): string =>
      key === '' ? 'Sans émetteur' : (m.get(key) ?? key)
  }, [issuers])

  // Regroupement par émetteur (clé null -> bucket « sans émetteur »), entrées récentes d'abord ;
  // les groupes sont classés par leur entrée la plus récente.
  const groups = useMemo(() => {
    const byIssuer = new Map<string, JournalEntry[]>()
    for (const e of journal.entries) {
      const key = e.issuerKey ?? ''
      const arr = byIssuer.get(key) ?? []
      arr.push(e)
      byIssuer.set(key, arr)
    }
    const out = [...byIssuer.entries()].map(([key, entries]) => ({
      key,
      entries: [...entries].sort((a, b) =>
        b.learnedAt.localeCompare(a.learnedAt),
      ),
    }))
    out.sort((a, b) =>
      (b.entries[0]?.learnedAt ?? '').localeCompare(
        a.entries[0]?.learnedAt ?? '',
      ),
    )
    return out
  }, [journal])

  const total = journal.entries.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-[42rem] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-base">
            Historique des factures apprises
          </DialogTitle>
          <DialogDescription className="text-xs">
            {total} facture{total > 1 ? 's' : ''} apprise{total > 1 ? 's' : ''},
            regroupée{total > 1 ? 's' : ''} par émetteur. Lecture seule.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <History className="size-8 opacity-60" />
              Aucune facture apprise pour l’instant. Tamponnez une facture pour
              l’enregistrer ici.
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.key} className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {displayOf(g.key)}{' '}
                  <span className="tabular-nums text-muted-foreground">
                    · {g.entries.length}
                  </span>
                </h2>
                <div className="flex flex-col gap-2">
                  {g.entries.map((e) => (
                    <div
                      key={e.hash}
                      className="rounded-lg border border-border bg-card px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 flex-1 text-sm text-foreground">
                          {e.codes.length > 0
                            ? e.codes.map((c) => budgetLabel(c)).join(', ')
                            : 'Aucune imputation'}
                        </p>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                          {e.learnedAt.slice(0, 10)}
                        </span>
                      </div>
                      {e.codes.length > 0 && (
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {e.codes
                            .map((c) =>
                              e.comptes?.[c] ? `${c} ${e.comptes[c]}` : c,
                            )
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

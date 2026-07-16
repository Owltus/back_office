import { Store } from '@tanstack/store'

import type { InvoiceRecord } from '#/lib/facturation/types.ts'

/*
 * Store module-level de l'atelier Facturation : les factures chargées et la
 * sélection SURVIVENT à la navigation (le board peut se démonter/remonter sans
 * rien perdre). En mémoire de session uniquement — remis à zéro à un rechargement
 * complet de la page (les `File` et les aperçus dataURL ne sont pas sérialisés).
 * Calqué sur src/lib/afficheStore.ts : singleton Store + actions exportées.
 *
 * Cycle de vie : `addInvoices` (naissance) → `patchInvoice` (lecture, imputation,
 * position, échelle) → `removeInvoice` (retrait d'une facture) → `clearFacturation`
 * (fin de session, tout est libéré).
 */

export interface FacturationState {
  records: InvoiceRecord[]
  selectedId: string | null
}

export const facturationStore = new Store<FacturationState>({
  records: [],
  selectedId: null,
})

/** Ajoute des factures en tête et sélectionne la première ajoutée. */
export function addInvoices(records: InvoiceRecord[]) {
  if (!records.length) return
  facturationStore.setState((s) => ({
    records: [...records, ...s.records],
    selectedId: records[0].id,
  }))
}

/** Met à jour un ou plusieurs champs d'une facture (par id). */
export function patchInvoice(id: string, next: Partial<InvoiceRecord>) {
  facturationStore.setState((s) => ({
    ...s,
    records: s.records.map((r) => (r.id === id ? { ...r, ...next } : r)),
  }))
}

/** Retire une facture ; re-sélectionne la première restante si c'était l'active. */
export function removeInvoice(id: string) {
  facturationStore.setState((s) => {
    const records = s.records.filter((r) => r.id !== id)
    return {
      records,
      selectedId: s.selectedId === id ? (records[0]?.id ?? null) : s.selectedId,
    }
  })
}

/** Change la facture sélectionnée. */
export function selectInvoice(id: string | null) {
  facturationStore.setState((s) => ({ ...s, selectedId: id }))
}

/** Fin de session : vide tout (factures + sélection). */
export function clearFacturation() {
  facturationStore.setState(() => ({ records: [], selectedId: null }))
}

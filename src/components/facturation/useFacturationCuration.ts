import { useQueryClient } from '@tanstack/react-query'

import {
  addIssuerDeny,
  unlearnIssuerCodes,
} from '#/lib/facturation/cloudService.ts'
import {
  mergeDenylist,
  type IssuerDenylist,
} from '#/lib/facturation/issuerDenylist.ts'

/*
 * Actions de CURATION du modèle facturation (bannir / désapprendre un couple émetteur↔code),
 * partagées par l'atelier (InvoicePanel) et la page de revue. Chaque action écrit côté serveur
 * (RPC SECURITY DEFINER) puis synchronise le cache TanStack Query : patch optimiste de la
 * denylist (union → code exclu tout de suite de la détection) et invalidation de la
 * co-occurrence émetteur→codes (le serveur fait foi après décrément). Best-effort : une erreur
 * (droits insuffisants, table absente, réseau) est PROPAGÉE à l'appelant pour affichage.
 */
export function useFacturationCuration() {
  const queryClient = useQueryClient()

  /** Interdit `code` pour `issuerKey` (denylist) puis purge sa co-occurrence positive. */
  async function banIssuerCode(issuerKey: string, code: string): Promise<void> {
    await addIssuerDeny(issuerKey, code)
    // Patch optimiste : le code est immédiatement exclu de la détection (la denylist fait
    // autorité, elle retire le code de TOUTES les sources — cf. detect.ts).
    queryClient.setQueryData<IssuerDenylist>(
      ['facturation', 'issuerDenylist'],
      (old) =>
        mergeDenylist(old ?? { perIssuer: {} }, {
          perIssuer: { [issuerKey]: new Set([code]) },
        }),
    )
    // Nettoyer le signal fréquentiel (le prior ne doit plus proposer le code) — best-effort :
    // la denylist suffit déjà à l'exclure, ce décrément n'est qu'un ménage du modèle.
    try {
      await unlearnIssuerCodes(issuerKey, [code])
    } catch {
      // Ignoré volontairement : l'exclusion est garantie par la denylist déjà posée.
    }
    queryClient.invalidateQueries({ queryKey: ['facturation', 'issuerCodes'] })
  }

  /** Retire une confirmation erronée émetteur↔code SANS bannir (simple décrément). */
  async function unlearnIssuerCode(
    issuerKey: string,
    code: string,
  ): Promise<void> {
    await unlearnIssuerCodes(issuerKey, [code])
    queryClient.invalidateQueries({ queryKey: ['facturation', 'issuerCodes'] })
  }

  return { banIssuerCode, unlearnIssuerCode }
}

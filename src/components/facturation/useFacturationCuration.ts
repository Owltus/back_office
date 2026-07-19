import { useQueryClient } from '@tanstack/react-query'

import {
  addIssuerDeny,
  forgetCloudCode,
  forgetIssuerCode as forgetIssuerCodeApi,
  removeIssuerDeny,
} from '#/lib/facturation/cloudService.ts'
import {
  removeIssuerCode,
  type IssuerCodes,
} from '#/lib/facturation/issuerCodes.ts'
import {
  mergeDenylist,
  removeDeny,
  type IssuerDenylist,
} from '#/lib/facturation/issuerDenylist.ts'
import type { WordPool } from '#/lib/facturation/wordpool.ts'

/*
 * Actions de CURATION du modèle facturation, partagées par l'atelier (InvoicePanel) et le
 * modal « Contrôle des imputations ». Chaque action écrit côté serveur (RPC SECURITY DEFINER)
 * puis synchronise le cache TanStack Query (patch optimiste). Best-effort : une erreur (droits
 * insuffisants, table absente, réseau) est PROPAGÉE à l'appelant pour affichage.
 *   - banIssuerCode / unbanIssuerCode : interdiction émetteur↔code (denylist) et son undo.
 *   - forgetIssuerCode : oubli COMPLET d'une association émetteur→code apprise (le prior).
 *   - resetCodeCloud : réinitialise tout le vocabulaire appris d'un code (le nuage de mots).
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
    // Oublier TOUTE la co-occurrence (pas un simple -1) : un couple banni ne doit plus peser
    // dans la maturité ni les anomalies, ni ressusciter avec son historique à l'unban. On ne
    // touche PAS au nuage du code (la denylist suffit à l'exclure ; le vocabulaire peut servir
    // à d'autres émetteurs). Best-effort : l'exclusion est déjà garantie par la denylist posée.
    try {
      await forgetIssuerCodeApi(issuerKey, code)
      queryClient.setQueryData<IssuerCodes>(
        ['facturation', 'issuerCodes'],
        (old) => removeIssuerCode(old ?? { perIssuer: {} }, issuerKey, code),
      )
    } catch {
      // Ignoré volontairement.
    }
  }

  /** Oubli COMPLET d'une association émetteur→code apprise. Retire la co-occurrence, PUIS,
   *  si plus AUCUN émetteur n'utilise ce code (nuage devenu orphelin), réinitialise aussi son
   *  vocabulaire — sinon le code garderait des mots sans plus être rattaché à personne. Un
   *  code encore partagé par d'autres émetteurs conserve son nuage (nettoyage best-effort). */
  async function forgetIssuerCode(
    issuerKey: string,
    code: string,
  ): Promise<void> {
    await forgetIssuerCodeApi(issuerKey, code)
    const next = queryClient.setQueryData<IssuerCodes>(
      ['facturation', 'issuerCodes'],
      (old) => removeIssuerCode(old ?? { perIssuer: {} }, issuerKey, code),
    )
    const stillUsed = next
      ? Object.values(next.perIssuer).some((cell) => (cell[code] ?? 0) > 0)
      : true
    if (!stillUsed) {
      // Nuage orphelin → on l'efface. Best-effort : l'association est déjà retirée, un échec
      // laisse juste un nuage nettoyable à la main (bouton « Réinitialiser »).
      try {
        await resetCodeCloud(code)
      } catch {
        // Ignoré volontairement.
      }
    }
  }

  /** Réinitialise le vocabulaire appris d'un code (efface tout son nuage de mots). */
  async function resetCodeCloud(code: string): Promise<void> {
    await forgetCloudCode(code)
    queryClient.setQueryData<WordPool>(['facturation', 'clouds'], (old) => {
      if (!old) return { perCode: {} }
      const perCode = { ...old.perCode }
      delete perCode[code]
      return { perCode }
    })
  }

  /** Lève une interdiction émetteur↔code (undo d'un ban) → le code redevient candidat. */
  async function unbanIssuerCode(
    issuerKey: string,
    code: string,
  ): Promise<void> {
    await removeIssuerDeny(issuerKey, code)
    queryClient.setQueryData<IssuerDenylist>(
      ['facturation', 'issuerDenylist'],
      (old) => removeDeny(old ?? { perIssuer: {} }, issuerKey, code),
    )
  }

  return { banIssuerCode, forgetIssuerCode, resetCodeCloud, unbanIssuerCode }
}

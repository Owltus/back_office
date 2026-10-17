/*
 * Effacement LOCAL de la session supabase-js (revue du 2026-09-28).
 *
 * `supabase.auth.signOut()` rend une erreur SANS effacer la session quand le
 * jeton est expiré et que son renouvellement échoue (panne réseau) : la clé
 * `sb-<ref>-auth-token` restait sur le poste partagé, et le renouvellement
 * automatique reconnectait le compte au retour du backend. auth-js relit la
 * session depuis le stockage à chaque appel : retirer la clé suffit à la
 * rendre inerte.
 */

import { clearLastActive } from '#/lib/auth/inactivity.ts'

/** Le stockage utile (injectable pour les tests). */
export type StockageSession = Pick<Storage, 'key' | 'length' | 'removeItem'>

const CLE_SESSION = /^sb-.+-auth-token(-code-verifier)?$/

/** Retire les clés de session supabase-js ; rend le nombre de clés retirées. */
export function effacerSessionLocale(stockage: StockageSession): number {
  const cles: string[] = []
  for (let i = 0; i < stockage.length; i++) {
    const cle = stockage.key(i)
    if (cle !== null && CLE_SESSION.test(cle)) cles.push(cle)
  }
  for (const cle of cles) stockage.removeItem(cle)
  return cles.length
}

/** Ce dont la déconnexion durcie a besoin du client d'auth (injectable). */
export interface ClientDeconnexion {
  signOut: () => Promise<{ error: unknown }>
}

/**
 * Déconnexion DURCIE (audit du 2026-10-17) : `signOut()` puis, s'il échoue
 * ou lève (panne), effacement local de la session. Seul chemin de
 * déconnexion de l'app — volontaire ET expiration par inactivité : avant ce
 * jour, l'expiration appelait `signOut()` nu, et une panne laissait la
 * session sur le poste partagé (rouverte au démarrage suivant, l'horodatage
 * d'activité ayant déjà été effacé). Rend l'erreur du `signOut` (null si
 * réussi) ; ne lève jamais.
 */
export async function deconnexionDurcie(
  client: ClientDeconnexion,
  stockage: () => StockageSession,
): Promise<{ error: unknown }> {
  const { error } = await client
    .signOut()
    .catch((err: unknown) => ({ error: err }))
  if (error) {
    try {
      effacerSessionLocale(stockage())
    } catch {
      // Stockage indisponible : rien à effacer.
    }
  }
  return { error: error ?? null }
}

/**
 * Fermeture d'une session expirée par INACTIVITÉ (lib/auth/inactivity.ts).
 * L'horodatage d'activité n'est effacé qu'APRÈS la déconnexion durcie : tant
 * que la session est encore sur le poste, il reste périmé, donc un
 * événement d'auth intercalé (renouvellement) ou un onglet fermé en cours de
 * route retombe sur l'expiration au lieu de rouvrir la session.
 */
export async function fermerSessionInactive(
  client: ClientDeconnexion,
  stockage: () => StockageSession,
): Promise<void> {
  await deconnexionDurcie(client, stockage)
  clearLastActive()
}

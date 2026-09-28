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

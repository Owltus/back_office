/*
 * Message lisible d'une erreur, quelle que soit sa forme.
 *
 * `String(err)` ne convient pas : Supabase ne lève pas des `Error`. Un échec
 * PostgREST arrive sous la forme d'un objet ORDINAIRE — `{ message, code,
 * details, hint }` — sur lequel `String()` répond « [object Object] », jetant
 * la seule information utile. Le motif fautif :
 *
 *     err instanceof Error ? err.message : String(err)   // ← perd tout
 *
 * Cette fonction rattrape les trois formes rencontrées : `Error`, chaîne nue,
 * et objet porteur d'un champ `message` (PostgrestError, AuthError, StorageError,
 * qui partagent tous cette forme).
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err) return err
  if (err !== null && typeof err === 'object' && 'message' in err) {
    const message = (err as { message: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return 'erreur inconnue'
}

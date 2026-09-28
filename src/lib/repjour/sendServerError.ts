/*
 * Message affiché quand l'Edge Function `send-report` répond en erreur.
 *
 * supabase-js ne lève pas sur une réponse non-2xx : il renvoie une
 * `FunctionsHttpError` dont `context` est la `Response` brute. Le message utile
 * (« Petit délai anti-doublon. Réessaie dans 8 s. », « Réservé aux
 * administrateurs »…) est dans son corps `{ error }` — sans le relire, un simple
 * refus d'anti-spam (429) s'affichait « L'envoi a échoué ».
 *
 * Les messages de `send-report` sont écrits pour l'utilisateur et volontairement
 * génériques (aucun détail interne) : on peut les afficher tels quels. Borné en
 * longueur par prudence ; tout le reste retombe sur le message générique.
 */

export const MESSAGE_ENVOI_ECHOUE =
  "L'envoi a échoué. Réessaie dans un instant."

const LONGUEUR_MAX = 200

function lisible(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t && t.length <= LONGUEUR_MAX ? t : null
}

/** Message du serveur pour une erreur `functions.invoke`, sinon le générique. */
export async function messageErreurEnvoi(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context
  if (ctx instanceof Response) {
    try {
      const corps = (await ctx.clone().json()) as { error?: unknown } | null
      const msg = lisible(corps?.error)
      if (msg) return msg
    } catch {
      // Corps absent ou non JSON : message générique.
    }
  }
  return MESSAGE_ENVOI_ECHOUE
}

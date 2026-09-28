// Marqueur d'envoi posé après un envoi MANUEL réussi.
//
// Rangé à part pour être testé sans monter le serveur HTTP de send-report.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.115.0'

/**
 * Pose `daily_reports.auto_sent_at` (« envoyé, auto ou manuel ») pour la date du
 * rapport. BEST-EFFORT : l'e-mail est déjà parti, un échec ici ne doit pas faire
 * échouer la réponse. Renvoie `true` si le marqueur est posé, `false` sinon
 * (échec journalisé).
 *
 * ⚠ supabase-js ne LÈVE pas sur une erreur de la base : il la RENVOIE dans
 * `{ error }`. L'ancien code n'avait qu'un `try/catch`, donc un refus ou une
 * erreur SQL passait sans trace (bandeau « pas encore envoyé » resté affiché).
 */
export async function poserMarqueurManuel(
  admin: SupabaseClient,
  reportDate: string,
  nowMs: number,
): Promise<boolean> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return false
  try {
    const { error } = await admin
      .from('daily_reports')
      .update({ auto_sent_at: new Date(nowMs).toISOString() })
      .eq('date', reportDate)
    if (error) {
      console.error("Marqueur d'envoi manuel non posé :", error.message)
      return false
    }
    return true
  } catch (e) {
    console.error(
      "Marqueur d'envoi manuel non posé :",
      e instanceof Error ? e.message : String(e),
    )
    return false
  }
}

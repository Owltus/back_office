/**
 * Expiration de session par INACTIVITÉ (décision de l'utilisateur, 2026-09-06).
 *
 * Sur l'offre gratuite de Supabase, GoTrue ne borne pas la durée des sessions
 * (« time-box » et « inactivity timeout » sont des réglages Pro) : les 17
 * sessions trouvées par l'audit n'avaient aucune date de fin, la plus
 * ancienne datait du 7 juillet. L'application applique donc elle-même la
 * règle : après 24 h sans avoir ouvert l'app, il faut se reconnecter.
 *
 * Mécanisme : un horodatage « dernière activité » en localStorage, rafraîchi
 * à chaque retour sur l'onglet et à chaque revalidation (onglet visible), lu
 * au démarrage et à chaque retour. Garde-fou côté client, partagé entre les
 * onglets d'un même poste ; il ne remplace pas une révocation serveur (qui
 * reste possible par suppression des sessions).
 */
export const INACTIVITY_LIMIT_MS = 24 * 60 * 60_000
export const LAST_ACTIVE_KEY = 'bo.auth.lastActive.v1'

/** Vrai si la dernière activité est plus vieille que la limite. */
export function isInactiveTooLong(
  lastActiveAt: number | null,
  now: number,
  limitMs: number = INACTIVITY_LIMIT_MS,
): boolean {
  if (lastActiveAt === null) return false
  if (!Number.isFinite(lastActiveAt)) return false
  return now - lastActiveAt > limitMs
}

export function readLastActive(): number | null {
  try {
    const raw = localStorage.getItem(LAST_ACTIVE_KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function writeLastActive(now: number) {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(now))
  } catch {
    // localStorage indisponible : la règle ne s'applique pas sur ce poste.
  }
}

export function clearLastActive() {
  try {
    localStorage.removeItem(LAST_ACTIVE_KEY)
  } catch {
    // Ignoré.
  }
}
